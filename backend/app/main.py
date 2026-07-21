import os
import sys
import uuid
import shutil
import logging
from typing import Dict

from fastapi import FastAPI, UploadFile, File, BackgroundTasks, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

# Ensure the backend directory is in the system path for resolving absolute imports
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app.schemas import JobStatusResponse, ChapterGenerationResponse
from app.config import settings
from app.services.audio import extract_audio_from_video
from app.services.transcriber import transcribe_audio
from app.services.llm import generate_chapters_from_transcript

# Setup logging configuration
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="ClipForge API",
    description="Backend processing API for auto-generating video chapters.",
    version="1.0.0"
)

# Configure CORS Middleware to allow requests from the frontend application
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Ensure the upload directory exists
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)

# Serve uploaded videos and artifacts statically
app.mount("/uploads", StaticFiles(directory=settings.UPLOAD_DIR), name="uploads")

# In-memory database to store processing jobs
jobs_db: Dict[str, JobStatusResponse] = {}

async def run_pipeline_task(job_id: str, video_path: str, audio_path: str):
    """
    Executes the video processing pipeline asynchronously in the background.
    """
    logger.info(f"Background pipeline task initiated for job_id: {job_id}")
    try:
        # Step 1: Extract audio track
        jobs_db[job_id].progress_percentage = 25
        logger.info(f"Job {job_id} [25%]: Extracting audio from video...")
        extract_audio_from_video(video_path, audio_path)

        # Step 2: Perform Whisper speech transcription
        jobs_db[job_id].progress_percentage = 50
        logger.info(f"Job {job_id} [50%]: Transcribing audio...")
        transcript = await transcribe_audio(audio_path)

        # Step 3: Run LLM to group transcription segments into chapters
        jobs_db[job_id].progress_percentage = 80
        logger.info(f"Job {job_id} [80%]: Generating chapters from transcript...")
        chapters_response = await generate_chapters_from_transcript(transcript, video_id=job_id)

        # Step 4: Processing successful
        jobs_db[job_id].progress_percentage = 100
        jobs_db[job_id].status = "completed"
        jobs_db[job_id].result = chapters_response
        logger.info(f"Job {job_id} [100%]: Completed successfully.")

    except Exception as e:
        logger.error(f"Job {job_id} failed during pipeline execution: {str(e)}", exc_info=True)
        jobs_db[job_id].status = "failed"
        jobs_db[job_id].progress_percentage = 100

    finally:
        # Clean up temporary extracted audio file
        if os.path.exists(audio_path):
            try:
                os.remove(audio_path)
                logger.info(f"Successfully cleaned up temporary audio: {audio_path}")
            except Exception as err:
                logger.warning(f"Failed to delete temporary audio {audio_path}: {err}")

@app.post("/api/process-video", response_model=JobStatusResponse)
async def process_video(background_tasks: BackgroundTasks, file: UploadFile = File(...)):
    """
    Endpoint to upload a video file and initiate chapter generation.
    Returns immediately with a job ID and 'processing' status.
    """
    # Create unique identifier for the job
    job_id = str(uuid.uuid4())
    
    # Save the file with its original extension if available
    _, ext = os.path.splitext(file.filename or "")
    if not ext:
        ext = ".mp4"
    video_filename = f"{job_id}{ext}"
    video_path = os.path.join(settings.UPLOAD_DIR, video_filename)
    audio_path = os.path.join(settings.UPLOAD_DIR, f"{job_id}.mp3")

    # Save uploaded file chunk by chunk to prevent loading large videos into memory
    try:
        with open(video_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        logger.info(f"Video file saved at: {video_path}")
    except Exception as e:
        logger.error(f"Failed to write uploaded video file: {str(e)}")
        raise HTTPException(status_code=500, detail="Could not save uploaded video file.")

    # Initialize job in DB
    job_status = JobStatusResponse(
        job_id=job_id,
        status="processing",
        progress_percentage=0,
        result=None
    )
    jobs_db[job_id] = job_status

    # Add pipeline execution task to background runner
    background_tasks.add_task(run_pipeline_task, job_id, video_path, audio_path)

    return job_status

@app.get("/api/jobs/{job_id}", response_model=JobStatusResponse)
async def get_job_status(job_id: str):
    """
    Endpoint to retrieve the current processing status and results of a job.
    """
    job = jobs_db.get(job_id)
    if not job:
        logger.warning(f"Status requested for non-existent job_id: {job_id}")
        raise HTTPException(status_code=404, detail="Job ID not found.")
    return job

@app.get("/api/health")
async def health():
    """
    Health check endpoint.
    """
    return {"status": "ok"}
