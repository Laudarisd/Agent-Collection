# Project Setup Guide

## Architecture

```
frontend/ (React + Vite)
├── User-friendly GUI for writing prompts
├── Displays execution history
└── Shows results and responses

backend/ (FastAPI + Gemini)
├── REST API endpoints
├── Database operations
├── Gemini agent with tools
└── MCP server integration

database/ (SQLite)
├── Prompts table
├── Results table
└── Execution history table
```

## Setup Instructions

### 1. Environment Setup

Copy `.env.example` files:
```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
cp .env.example .env
```

Add your Gemini API key to `.env`:
```
GEMINI_API_KEY=your_key_here
```

### 2. Backend Setup

```bash
cd backend
python -m venv venv
source venv/bin/activate  # or `venv\Scripts\activate` on Windows
pip install -e .
```

Run the backend:
```bash
python app.py
# Backend runs at http://localhost:8000
```

### 3. Frontend Setup

```bash
cd frontend
npm install
npm run dev
# Frontend runs at http://localhost:5173
```

### 4. Docker Setup (Optional)

```bash
docker-compose up
```

## API Endpoints

### Create Prompt
POST `/api/prompts/`
```json
{
  "user_input": "Your prompt here"
}
```

### List Prompts
GET `/api/prompts/?skip=0&limit=10`

### Get Prompt Details
GET `/api/prompts/{id}`

### Get Results
GET `/api/prompts/{id}/results`

## Database Schema

### Prompts Table
- `id`: Primary key
- `user_input`: User's prompt text
- `status`: pending, processing, completed, error
- `created_at`: Timestamp
- `updated_at`: Timestamp

### Results Table
- `id`: Primary key
- `prompt_id`: Foreign key to prompts
- `output`: Execution output
- `error_message`: Error details
- `execution_logs`: Detailed logs
- `model_response`: Gemini model response
- `tokens_used`: Token count
- `execution_time_ms`: Execution duration
- `completed_at`: Completion timestamp

### ExecutionHistory Table
- `id`: Primary key
- `prompt_id`: Foreign key to prompts
- `tool_name`: Name of executed tool
- `tool_input`: Tool input parameters
- `tool_output`: Tool output/result
- `iteration`: Agent loop iteration number
- `created_at`: Timestamp

## Next Steps

1. **Configure Tools**: Add your project-specific tools in `backend/src/tools/`
2. **Customize System Prompt**: Update the agent system prompt in `backend/src/agent/agent_core.py`
3. **Add Authentication**: Implement if needed
4. **Deploy**: Use Docker for production deployment
