import os
import subprocess
import logging

logger = logging.getLogger(__name__)

def extract_audio_from_video(video_path: str, output_audio_path: str) -> str:
    """
    Extracts audio from a video file and saves it as an optimized MP3 file
    downsampled to 16kHz mono.

    Args:
        video_path (str): The path to the input video file.
        output_audio_path (str): The path where the extracted audio should be saved (should end in .mp3).

    Returns:
        str: The path to the successfully extracted audio file.

    Raises:
        FileNotFoundError: If the input video file does not exist.
        RuntimeError: If FFmpeg fails or another error occurs.
    """
    # 1. Validate input video path existence
    if not os.path.exists(video_path):
        error_msg = f"Input video file does not exist: {video_path}"
        logger.error(error_msg)
        raise FileNotFoundError(error_msg)

    # Ensure the parent directory of the output path exists
    output_dir = os.path.dirname(output_audio_path)
    if output_dir:
        os.makedirs(output_dir, exist_ok=True)

    # 2. Build the FFmpeg command
    # -y: Overwrite output file if it exists
    # -i: Input video path
    # -vn: Disable video recording (audio extraction only)
    # -ac 1: Downsample to mono channel
    # -ar 16000: Set audio sample rate to 16000 Hz (16kHz)
    # -codec:a libmp3lame: Use LAME MP3 encoder
    # -q:a 4: Set variable bitrate audio quality (LAME quality scale, standard/optimal)
    cmd = [
        "ffmpeg",
        "-y",
        "-i", video_path,
        "-vn",
        "-ac", "1",
        "-ar", "16000",
        "-codec:a", "libmp3lame",
        "-q:a", "4",
        output_audio_path
    ]

    logger.info(f"Starting audio extraction. Command: {' '.join(cmd)}")

    try:
        # Run FFmpeg command and capture stdout/stderr for logging/error debugging
        result = subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            check=True
        )
        logger.info(f"Audio extraction successful: {output_audio_path}")
        return output_audio_path

    except subprocess.CalledProcessError as e:
        logger.error(f"FFmpeg failed with exit code {e.returncode}. Stderr: {e.stderr}")
        # Clean up any partially written/corrupt output files on failure
        if os.path.exists(output_audio_path):
            try:
                os.remove(output_audio_path)
                logger.info(f"Cleaned up partial output file: {output_audio_path}")
            except Exception as cleanup_err:
                logger.warning(f"Could not clean up {output_audio_path}: {cleanup_err}")
        
        raise RuntimeError(f"Audio extraction failed due to FFmpeg error: {e.stderr}") from e

    except Exception as e:
        logger.error(f"Unexpected error during audio extraction: {str(e)}")
        # Clean up on any other generic exception
        if os.path.exists(output_audio_path):
            try:
                os.remove(output_audio_path)
            except Exception:
                pass
        raise RuntimeError(f"Audio extraction failed due to unexpected error: {str(e)}") from e
