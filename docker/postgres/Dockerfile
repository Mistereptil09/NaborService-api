FROM postgres:17

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      build-essential \
      postgresql-server-dev-17 \
      git \
      ca-certificates && \
    git clone --depth 1 https://github.com/fboulnois/pg_uuidv7.git /tmp/pg_uuidv7 && \
    cd /tmp/pg_uuidv7 && \
    make && make install && \
    cd / && rm -rf /tmp/pg_uuidv7 && \
    apt-get purge -y build-essential postgresql-server-dev-17 git && \
    apt-get autoremove -y && \
    rm -rf /var/lib/apt/lists/*
