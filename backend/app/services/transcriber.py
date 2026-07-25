import asyncio
import os
import sys
import time
import logging
from typing import List, Optional

# Add backend directory to sys.path to ensure 'app' imports work regardless of run context
backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

# pyrefly: ignore [missing-import]
from faster_whisper import WhisperModel
from app.schemas import TranscriptSegment

logger = logging.getLogger(__name__)

# Global singleton cache for the Whisper model
_whisper_model: Optional[WhisperModel] = None

def get_whisper_model() -> WhisperModel:
    """
    Retrieves the singleton instance of the WhisperModel.
    Loads the model weights if they are not already cached.
    """
    global _whisper_model
    if _whisper_model is None:
        logger.info("Initializing and caching Whisper 'small' model on CPU (int8)...")
        # Initialize the model on CPU with int8 quantization for speed and low memory footprint
        _whisper_model = WhisperModel("small", device="cpu", compute_type="int8")
        logger.info("Whisper model loaded successfully.")
    assert _whisper_model is not None, "Whisper model failed to initialize"
    return _whisper_model



def _run_transcription_sync(audio_path: str) -> List[TranscriptSegment]:
    """
    Synchronous blocking function to run Whisper model inference and consume the segments generator.
    This runs in a background thread to prevent blocking the main asyncio event loop.
    """
    model = get_whisper_model()
    
    # vad_filter=True uses Voice Activity Detection to ignore long silent sections
    segments, info = model.transcribe(audio_path, vad_filter=True)
    
    logger.info(
        f"Audio info: Language='{info.language}' (prob={info.language_probability:.2f}), "
        f"Duration={info.duration:.2f}s"
    )
    
    # Consume the generator fully inside this thread to perform the actual model computation
    transcript_segments = []
    for segment in segments:
        transcript_segments.append(
            TranscriptSegment(
                start=segment.start,
                end=segment.end,
                text=segment.text.strip()
            )
        )
    return transcript_segments

async def transcribe_audio(audio_path: str) -> List[TranscriptSegment]:
    """
    Transcribes an audio file asynchronously and returns a structured list of segments.

    Args:
        audio_path (str): The path to the audio file to transcribe.

    Returns:
        List[TranscriptSegment]: A list of mapped transcription segments with timestamps.
    """
    start_time = time.perf_counter()
    logger.info(f"Starting async transcription for: {audio_path}")
    
    try:
        # Offload the heavy blocking CPU-bound work to a separate thread pool
        segments = await asyncio.to_thread(_run_transcription_sync, audio_path)
        
        duration = time.perf_counter() - start_time
        logger.info(f"Transcription finished successfully in {duration:.2f}s (Segments count: {len(segments)}).")
        return segments
    except Exception as e:
        duration = time.perf_counter() - start_time
        logger.error(f"Error during audio transcription after {duration:.2f}s: {str(e)}")
        raise RuntimeError(f"Transcription failed: {str(e)}") from e
