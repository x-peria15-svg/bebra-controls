FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv python3-pip bash ca-certificates git && rm -rf /var/lib/apt/lists/* && mkdir -p /home/container && chown 1000:1000 /home/container
COPY entrypoint.sh /entrypoint.sh
RUN chmod 755 /entrypoint.sh
USER 1000:1000
ENV HOME=/home/container USER=container
WORKDIR /home/container
ENTRYPOINT ["/bin/bash", "/entrypoint.sh"]
