FROM docker.io/library/python:3.13-alpine

ARG TARGETARCH
ARG VENDOR
ARG VERSION

ENV UMASK="0002" \
    TZ="Europe/Berlin" \
    POWERSHELL_DISTRIBUTION_CHANNEL="PSDocker" \
    POSTERIZARR_NON_ROOT="TRUE" \
    APP_ROOT="/app" \
    APP_DATA="/config"
    
# Install packages, create directories, copy files, and set permissions in a single RUN command to reduce layers
RUN apk add --no-cache \
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
    && pip install apprise \
    && mkdir -p /app && chmod -R 755 /app

COPY . /app/

USER nobody:nogroup

WORKDIR /config

VOLUME ["/config"]

# Run Start.ps1 directly with parameter passing
ENTRYPOINT ["pwsh", "-NoProfile", "-File", "/app/Start.ps1"]

LABEL org.opencontainers.image.source="https://github.com/fscorrupt/Posterizarr"
LABEL org.opencontainers.image.description="Posterizarr - Automated poster generation for Plex/Jellyfin/Emby media libraries"
LABEL org.opencontainers.image.licenses="GPL-3.0"
