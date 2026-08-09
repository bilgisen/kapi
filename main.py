"""Root entrypoint shim — FastAPI Cloud autodetect (main.py).

FastAPI Cloud, pyproject.toml [tool.fastapi] entrypoint'ini okuyamadığı
durumlarda kök dizindeki main.py/app.py'yi otomatik bulur. Bu shim,
gerçek uygulamayı apps.fetch.app'ten yeniden dışa aktarır.
"""

from apps.fetch.app import app

__all__ = ["app"]