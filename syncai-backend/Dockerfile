FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN chmod +x start.sh

# Railway는 $PORT 환경변수를 자동 주입함 — start.sh 에서 사용
CMD ["./start.sh"]
