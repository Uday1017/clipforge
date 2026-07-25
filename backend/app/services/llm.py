import logging
import json
import asyncio
from typing import List
from pydantic import ValidationError

from app.schemas import TranscriptSegment, VideoChapter, ChapterGenerationResponse
from app.config import settings

logger = logging.getLogger(__name__)

def _generate_fallback_chapters(transcript: List[TranscriptSegment], video_id: str) -> ChapterGenerationResponse:
    """
    Heuristic fallback to generate basic chapters when LLM keys are missing or API calls fail.
    Divides the transcript into 3 equal duration chapters.
    """
    logger.warning("Using heuristic fallback to generate chapters.")
    if not transcript:
        return ChapterGenerationResponse(
            video_id=video_id,
            total_duration=0.0,
            chapters=[]
        )
    
    total_duration = transcript[-1].end
    num_chapters = min(3, max(1, len(transcript)))
    chapter_duration = total_duration / num_chapters
    
    chapters = []
    for i in range(num_chapters):
        start = i * chapter_duration
        end = (i + 1) * chapter_duration
        
        # Find some text from the transcript segments that fall in this range
        segment_texts = [seg.text for seg in transcript if seg.start >= start and seg.start < end]
        summary_text = " ".join(segment_texts[:2]) if segment_texts else "Content overview."
        if len(summary_text) > 150:
            summary_text = summary_text[:147] + "..."
            
        if i == 0:
            title = "Introduction: Opening Hook"
        elif i == num_chapters - 1:
            title = "Conclusion: Closing Remarks"
        else:
            title = f"Key Insight: Section {i+1}"
            
        chapters.append(
            VideoChapter(
                start_time=round(start, 2),
                end_time=round(end, 2),
                title=title,
                summary=summary_text or "Discussion of video content.",
                tags=["video", f"part-{i+1}", "overview"]
            )
        )
        
    return ChapterGenerationResponse(
        video_id=video_id,
        total_duration=round(total_duration, 2),
        chapters=chapters,
        transcript=transcript,
        video_summary="Heuristic fallback summary: The video has been partitioned based on duration thresholds because LLM integration was bypassed."
    )

def _generate_via_gemini(transcript_text: str, video_id: str, total_duration: float) -> ChapterGenerationResponse:
    """
    Synchronous helper to invoke the Gemini API.
    """
    from google import genai
    from google.genai import types
    
    logger.info("Attempting chapter generation via Gemini API...")
    client = genai.Client(api_key=settings.GEMINI_API_KEY)
    
    prompt = f"""
    Here is the video transcript:
    {transcript_text}
    
    Please analyze it and generate structured chapters for video ID: {video_id} with total duration: {total_duration}s.
    Also generate a comprehensive high-level summary of what the entire video is about (populate the 'video_summary' field).
    """
    
    response = client.models.generate_content(
        model='gemini-2.5-flash',
        contents=prompt,
        config=types.GenerateContentConfig(
            system_instruction=(
                "You are an expert video editor. Analyze topic shifts across the transcript timestamps. "
                "Divide the video logically into distinct chapters. For short videos, create chapters "
                "every 15 to 30 seconds for a highly granular, interactive navigation experience. "
                "For the first chapter (starting near 0.0s), the title MUST include the word 'Introduction' or 'Opening Hook'. "
                "For the last chapter, the title MUST include the word 'Conclusion' or 'Closing Remarks'. "
                "Strictly forbid generic titles like 'Chapter 1', 'Segment Overview', 'Part 1', or repetitive tags. "
                "Titles must be highly engaging, explicit, and descriptive (max 6 words), describing exactly what is discussed "
                "(e.g., 'Introduction: Greeting the Audience', 'Core Argument: Why 18-Minute Talks Fail', 'Summary & Final Remarks'). "
                "Provide a 1-2 sentence concise summary and 3-5 tags (keywords) for each chapter. "
                "Ensure start_time and end_time match the original transcript seconds exactly. "
                "Finally, provide a comprehensive high-level summary of what the entire video is about in the 'video_summary' field."
            ),
            response_mime_type="application/json",
            response_schema=ChapterGenerationResponse,
        ),
    )
    
    # Parse the response text using the Pydantic schema
    result = ChapterGenerationResponse.model_validate_json(response.text)
    return result

async def _generate_via_groq(transcript_text: str, video_id: str, total_duration: float) -> ChapterGenerationResponse:
    """
    Asynchronous helper to invoke the Groq API.
    """
    from groq import AsyncGroq
    
    logger.info("Attempting chapter generation via Groq API...")
    client = AsyncGroq(api_key=settings.GROQ_API_KEY)
    
    prompt = f"""
    Here is the video transcript:
    {transcript_text}
    
    Generate structured chapters for video ID: "{video_id}" with total duration: {total_duration}s.
    Conform strictly to the following JSON structure:
    {{
        "video_id": "{video_id}",
        "total_duration": {total_duration},
        "video_summary": "string (comprehensive high-level summary of the entire video)",
        "chapters": [
            {{
                "start_time": float,
                "end_time": float,
                "title": "string (max 6 words, highly descriptive)",
                "summary": "string (1-2 concise sentences)",
                "tags": ["string"]
            }}
        ]
    }}
    """
    
    chat_completion = await client.chat.completions.create(
        messages=[
            {
                "role": "system",
                "content": (
                    "You are an expert video editor. Analyze topic shifts across the transcript timestamps. "
                    "Divide the video logically into distinct chapters. For short videos, create chapters "
                    "every 15 to 30 seconds for a highly granular, interactive navigation experience. "
                    "For the first chapter (starting near 0.0s), the title MUST include the word 'Introduction' or 'Opening Hook'. "
                    "For the last chapter, the title MUST include the word 'Conclusion' or 'Closing Remarks'. "
                    "Strictly forbid generic titles like 'Chapter 1', 'Segment Overview', 'Part 1', or repetitive tags. "
                    "Titles must be highly engaging, explicit, and descriptive (max 6 words), describing exactly what is discussed "
                    "(e.g., 'Introduction: Greeting the Audience', 'Core Argument: Why 18-Minute Talks Fail', 'Summary & Final Remarks'). "
                    "Provide a 1-2 sentence concise summary and 3-5 tags (keywords) for each chapter. "
                    "Ensure start_time and end_time match the original transcript seconds exactly. "
                    "Provide a comprehensive summary of what the entire video is about in 'video_summary'. "
                    "Output ONLY valid JSON matching the requested schema."
                ),
            },
            {
                "role": "user",
                "content": prompt,
            }
        ],
        model="llama-3.3-70b-versatile",
        response_format={"type": "json_object"},
    )
    
    response_text = chat_completion.choices[0].message.content
    result = ChapterGenerationResponse.model_validate_json(response_text)
    return result

async def generate_chapters_from_transcript(transcript: List[TranscriptSegment], video_id: str) -> ChapterGenerationResponse:
    """
    Generates structured video chapters from a list of transcript segments using Gemini or Groq LLMs.
    Falls back to a rule-based division if no API keys are set, or if the API calls fail/fail validation.

    Args:
        transcript (List[TranscriptSegment]): List of timestamped transcription segments.
        video_id (str): Unique identifier of the video.

    Returns:
        ChapterGenerationResponse: The structured chapters response.
    """
    if not transcript:
        return ChapterGenerationResponse(
            video_id=video_id,
            total_duration=0.0,
            chapters=[]
        )
        
    total_duration = transcript[-1].end
    
    # Format the transcript into: [start_time_s - end_time_s] text
    transcript_lines = [
        f"[{seg.start:.2f} - {seg.end:.2f}] {seg.text}"
        for seg in transcript
    ]
    transcript_text = "\n".join(transcript_lines)
    
    # 1. Try Gemini if the API key is configured
    if settings.GEMINI_API_KEY:
        try:
            # Offload the blocking Gemini client execution to a background thread
            result = await asyncio.to_thread(_generate_via_gemini, transcript_text, video_id, total_duration)
            result.transcript = transcript
            logger.info("Successfully generated chapters using Gemini API.")
            return result
        except Exception as e:
            logger.error(f"Gemini chapter generation failed: {str(e)}")
            
    # 2. Try Groq if the API key is configured
    if settings.GROQ_API_KEY:
        try:
            result = await _generate_via_groq(transcript_text, video_id, total_duration)
            result.transcript = transcript
            logger.info("Successfully generated chapters using Groq API.")
            return result
        except Exception as e:
            logger.error(f"Groq chapter generation failed: {str(e)}")
            
    # 3. Fallback heuristic generator if LLM paths failed or are not configured
    logger.warning("All LLM paths failed or were not configured. Invoking heuristic fallback chapter generator.")
    result = _generate_fallback_chapters(transcript, video_id)
    result.transcript = transcript
    return result
