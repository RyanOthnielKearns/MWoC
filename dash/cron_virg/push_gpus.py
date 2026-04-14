import subprocess
import json
import urllib.request
import os
from datetime import datetime, timezone
from dotenv import load_dotenv

load_dotenv(".env")

UPSTASH_REDIS_REST_URL = os.getenv('UPSTASH_REDIS_REST_URL')
UPSTASH_REDIS_REST_TOKEN = os.getenv('UPSTASH_REDIS_REST_TOKEN')

result = subprocess.run([
    "nvidia-smi",
    "--query-gpu=index,name,utilization.gpu,memory.used,memory.total,temperature.gpu",
    "--format=csv,noheader,nounits"
], capture_output=True, text=True)

gpus = []
for line in result.stdout.strip().split("\n"):
    idx, name, util, mem_used, mem_total, temp = [
        x.strip() for x in line.split(",")]
    util = int(util)
    mem_used = int(mem_used)
    gpus.append({
        "index": int(idx), "name": name,
        "utilization": util, "memory_used": mem_used,
        "memory_total": int(mem_total), "temperature": int(temp),
        "free": util < 5 and mem_used < 1000,
        "percent_available": round(((int(mem_total)-mem_used)/int(mem_total) * 100), 2)
    })

payload = json.dumps({
    "gpus": gpus,
    "updatedAt": datetime.now(timezone.utc).isoformat()
}).encode()


req = urllib.request.Request(
    f"{UPSTASH_REDIS_REST_URL}/set/gpu:state",
    data=payload,
    headers={"Authorization": f"Bearer {UPSTASH_REDIS_REST_TOKEN}",
             "Content-Type": "application/json"},
    method="POST"
)

urllib.request.urlopen(req)

print(json.dumps(gpus, indent=2))
print("db update sent")
