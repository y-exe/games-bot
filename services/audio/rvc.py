import asyncio
import os
import shutil
import tempfile


RVC_ROOT = "/opt/rvc"
RVC_ASSETS = "/app/rvc-assets"


async def convert_audio(source: bytes, extension: str) -> bytes | None:
    """Run the CPU RVC CLI only for the duration of one request."""
    with tempfile.TemporaryDirectory(prefix="rvc-", dir="/tmp") as directory:
        source_path = os.path.join(directory, f"input.{extension}")
        output_path = os.path.join(directory, "output.wav")
        with open(source_path, "wb") as file:
            file.write(source)
        hubert_dir = os.path.join(RVC_ROOT, "assets", "hubert")
        os.makedirs(hubert_dir, exist_ok=True)
        hubert_path = os.path.join(hubert_dir, "hubert_base.pt")
        if not os.path.exists(hubert_path):
            os.symlink(os.path.join(RVC_ASSETS, "hubert_base.pt"), hubert_path)
        environment = {**os.environ, "weight_root": RVC_ASSETS, "OMP_NUM_THREADS": "1", "MKL_NUM_THREADS": "1"}
        process = await asyncio.create_subprocess_exec(
            "python", "tools/infer_cli.py", "--device", "cpu", "--f0up_key", "0",
            "--input_path", source_path, "--opt_path", output_path, "--model_name", "ymkw.pth",
            cwd=RVC_ROOT, env=environment, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
        )
        await process.communicate()
        if process.returncode or not os.path.exists(output_path):
            return None
        with open(output_path, "rb") as file:
            return file.read()
