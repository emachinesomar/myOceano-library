from fastapi import FastAPI
from pydantic import BaseModel
from sentence_transformers import SentenceTransformer
from typing import List

app = FastAPI()
# Initialize model outside the endpoint for performance
model = SentenceTransformer('all-MiniLM-L6-v2')

class EmbedRequest(BaseModel):
    chunks: List[str]

@app.post("/embed_chunks")
async def embed_chunks(request: EmbedRequest):
    """
    Endpoint to generate embeddings for a list of text chunks.
    """
    embeddings = model.encode(request.chunks)
    return {"embeddings": embeddings.tolist()}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
