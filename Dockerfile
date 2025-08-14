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

# Install build tools, runtime dependencies, libraqm, and ImageMagick with raqm support
RUN echo @edge http://dl-cdn.alpinelinux.org/alpine/edge/community >> /etc/apk/repositories \
    && echo @edge http://dl-cdn.alpinelinux.org/alpine/edge/main >> /etc/apk/repositories \
    && apk upgrade --update-cache --available \
    && apk update \
    && apk add --no-cache \
        catatonit \
        curl \
        fontconfig \
        libjpeg-turbo \
        imagemagick@edge \
        imagemagick-libs@edge \
        imagemagick-heic \
        imagemagick-jpeg \
        imagemagick-webp@edge \
        libwebp \
        libwebp-tools \
        librsvg@edge \
        powershell \
        tzdata \
    && pwsh -NoProfile -Command "Set-PSRepository -Name PSGallery -InstallationPolicy Trusted; \
            Install-Module -Name FanartTvAPI -Scope AllUsers -Force" \
    && pip install --no-cache-dir apprise \
    && mkdir -p /app /usr/share/fonts/custom /var/cache/fontconfig \
    && chmod -R 755 /app /usr/local/share/powershell \
    && chmod -R 777 /usr/share/fonts/custom /var/cache/fontconfig

COPY . /app

USER nobody:nogroup

WORKDIR /config

VOLUME ["/config"]

ENTRYPOINT ["/usr/bin/catatonit", "--", "pwsh", "-NoProfile", "/app/Start.ps1"]

LABEL org.opencontainers.image.source="https://github.com/fscorrupt/Posterizarr"
LABEL org.opencontainers.image.description="Posterizarr - Automated poster generation for Plex/Jellyfin/Emby media libraries"
LABEL org.opencontainers.image.licenses="GPL-3.0"