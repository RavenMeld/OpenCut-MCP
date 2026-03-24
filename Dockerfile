# Use the official Playwright image — has Chromium + all system deps pre-installed
FROM mcr.microsoft.com/playwright:v1.58.2-noble

# Install Bun (apt-get update first, then unzip required by the installer)
RUN apt-get update && apt-get install -y unzip && curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:$PATH"

WORKDIR /app

# Copy package manifest and install deps
# Skip browser download — already baked into the base image at /ms-playwright
COPY package.json tsconfig.json ./
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN bun install

# Copy source
COPY src/ ./src/

# Default: reach the OpenCut web app running on the Docker host
ENV OPENCUT_URL=http://host.docker.internal:3001
ENV MCP_HEADLESS=true

CMD ["bun", "run", "src/index.ts"]
