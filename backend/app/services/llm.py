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
            
        chapters.append(
            VideoChapter(
                start_time=round(start, 2),
                end_time=round(end, 2),
                title=f"Chapter {i+1}: Segment Overview",
                summary=summary_text or "Discussion of video content.",
                keywords=["video", f"part-{i+1}", "overview"]
            )
        )
        
    return ChapterGenerationResponse(
        video_id=video_id,
        total_duration=round(total_duration, 2),
        chapters=chapters
    )

def _generate_via_gemini(transcript_text: str, video_id: str, total_duration: float) -> ChapterGenerationResponse:
    """
    Synchronous helper to invoke the Gemini API.
    """
    from google import genai
    from google.genai import types
    
    logger.info("Attempting chapter generation via Gemini API...")
    # Initialize the Gemini Client
    client = genai.Client(api_key=settings.GEMINI_API_KEY)
    
    prompt = f"""
    Here is the video transcript:
    {transcript_text}
    
    Please analyze it and generate structured chapters for video ID: {video_id} with total duration: {total_duration}s.
    """
    
    response = client.models.generate_content(
        model='gemini-2.5-flash',
        contents=prompt,
        config=types.GenerateContentConfig(
            system_instruction=(
                "You are an expert video editor and content producer. "
                "Analyze topic shifts across the transcript timestamps. "
                "Divide the video logically into 3 to 7 distinct chapters depending on the total duration. "
                "For each chapter, provide: a concise, professional title, a 2-sentence summary, "
                "and 3-5 relevant keywords. Ensure start_time and end_time match the original transcript seconds."
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
        "chapters": [
            {{
                "start_time": float,
                "end_time": float,
                "title": "string",
                "summary": "string (exactly 2 sentences)",
                "keywords": ["string"]
            }}
        ]
    }}
    """
    
    chat_completion = await client.chat.completions.create(
        messages=[
            {
                "role": "system",
                "content": (
                    "You are an expert video editor and content producer. "
                    "Analyze topic shifts across the transcript timestamps. "
                    "Divide the video logically into 3 to 7 distinct chapters depending on total length. "
                    "Provide a concise, professional title, a 2-sentence summary, and 3-5 relevant keywords for each chapter. "
                    "Ensure start_time and end_time match the original transcript seconds accurately. "
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
            logger.info("Successfully generated chapters using Gemini API.")
            return result
        except Exception as e:
            logger.error(f"Gemini chapter generation failed: {str(e)}")
            
    # 2. Try Groq if the API key is configured
    if settings.GROQ_API_KEY:
        try:
            result = await _generate_via_groq(transcript_text, video_id, total_duration)
            logger.info("Successfully generated chapters using Groq API.")
            return result
        except Exception as e:
            logger.error(f"Groq chapter generation failed: {str(e)}")
            
    # 3. Fallback heuristic generator if LLM paths failed or are not configured
    logger.warning("All LLM paths failed or were not configured. Invoking heuristic fallback chapter generator.")
    return _generate_fallback_chapters(transcript, video_id)
