FROM docker.io/library/python:3.13-alpine

ARG TARGETARCH
ARG VENDOR
ARG VERSION

ENV UMASK="0002" \
    TZ="Europe/Berlin" \
    POWERSHELL_DISTRIBUTION_CHANNEL="PSDocker" \
    FONTS_GID=5555 \
    POSTERIZARR_NON_ROOT="TRUE" \
    APP_ROOT="/app" \
    APP_DATA="/config" \
    FONTCONFIG_CACHE_DIR="/var/cache/fontconfig"


# Install packages, create directories, copy files, set permissions, and clean up in a single RUN command to reduce layers
RUN apk add --no-cache \
        catatonit \
        curl \
        fontconfig \
        imagemagick  \
        imagemagick-heic \
        imagemagick-jpeg \
        libjpeg-turbo \
        pango \
        powershell \
        tzdata \
    && pwsh -NoProfile -Command "Set-PSRepository -Name PSGallery -InstallationPolicy Trusted; \
        Install-Module -Name FanartTvAPI -Scope AllUsers -Force" \
    && pip install --no-cache-dir apprise \
    && mkdir -p /app /usr/share/fonts/custom /var/cache/fontconfig \
    && chmod -R 755  /app \
        /usr/local/share/powershell \
    && chmod -R 777 /usr/share/fonts/custom /var/cache/fontconfig \
    && apk del curl

COPY . /app

USER nobody:nogroup

WORKDIR /config

VOLUME ["/config"]

# Run Start.ps1 directly with parameter passing
ENTRYPOINT ["/usr/bin/catatonit", "--", "pwsh", "-NoProfile", "/app/Start.ps1"]

LABEL org.opencontainers.image.source="https://github.com/fscorrupt/Posterizarr"
LABEL org.opencontainers.image.description="Posterizarr - Automated poster generation for Plex/Jellyfin/Emby media libraries"
LABEL org.opencontainers.image.licenses="GPL-3.0"
