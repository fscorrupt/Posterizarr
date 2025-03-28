FROM docker.io/library/python:3.13-alpine

ARG TARGETARCH
ARG VENDOR
ARG VERSION

ENV UMASK="0002" \
    TZ="Europe/Berlin" \
    POWERSHELL_DISTRIBUTION_CHANNEL="PSDocker" \
    PosterizarrNonRoot="TRUE" \
    PSModuleAnalysisCacheEnabled="false" \
    PSModuleAnalysisCachePath=""

RUN apk add --no-cache \
        catatonit \
        curl \
        imagemagick  \
        imagemagick-heic \
        imagemagick-jpeg \
        libjpeg-turbo \
        powershell \
        tzdata \
    && pwsh -NoProfile -Command "Set-PSRepository -Name PSGallery -InstallationPolicy Trusted; \
        Install-Module -Name FanartTvAPI -Scope AllUsers -Force" \
    && chmod -R 755 /usr/local/share/powershell \
    && pip install apprise

# Create necessary directories & set permissions in one command
RUN mkdir -p /config/Logs /config/temp /config/watcher /config/test \
    && chmod -R 755 /config \
    && chown -R nobody:nogroup /config \
    && mkdir -p /.local/share/powershell/PSReadLine \
    && chown -R nobody:nogroup /.local \
    && chmod -R 755 /.local

# Copy application & config files
COPY entrypoint.sh Start.ps1 donate.txt /
COPY config.example.json overlay.png backgroundoverlay.png Rocky.ttf Comfortaa-Medium.ttf Colus-Regular.ttf overlay-innerglow.png backgroundoverlay-innerglow.png Posterizarr.ps1 /config/

# Fix file permissions in a single RUN command
RUN chmod +x /entrypoint.sh \
    && chown nobody:nogroup /entrypoint.sh

USER nobody:nogroup

WORKDIR /config

VOLUME ["/config"]

ENTRYPOINT ["/usr/bin/catatonit", "--", "/entrypoint.sh"]

LABEL org.opencontainers.image.source="https://github.com/fscorrupt/Posterizarr"
LABEL org.opencontainers.image.description="Posterizarr - Automated poster generation for Plex/Jellyfin/Emby media libraries"
LABEL org.opencontainers.image.licenses="GPL-3.0"
