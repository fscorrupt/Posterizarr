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
RUN apk add --no-cache \
        meson \
        ninja \
        catatonit \
        curl \
        fontconfig \
        libjpeg-turbo \
        pango \
        powershell \
        tzdata \
        git \
        build-base \
        freetype-dev \
        harfbuzz-dev \
        fribidi-dev \
        cairo-dev \
        pango-dev \
        glib-dev \
        fontconfig-dev \
        libjpeg-turbo-dev \
        libpng-dev \
        tiff-dev \
        libwebp-dev \
        libxml2-dev \
        lcms2-dev \
        libzip-dev \
        bzip2-dev \
        ghostscript-dev \
        xz-dev \
        zlib-dev \
        fftw-dev \
        pkgconfig \
    && git clone https://github.com/HOST-Oman/libraqm.git \
    && cd libraqm \
    && meson setup build \
    && meson compile -C build \
    && meson install -C build \
    && cd .. \
    && wget https://imagemagick.org/download/ImageMagick.tar.gz \
    && tar -xzf ImageMagick.tar.gz \
    && cd ImageMagick-* \
    && ./configure --with-raqm=yes --disable-dependency-tracking \
    && make -j$(nproc) \
    && make install \
    && cd .. \
    && rm -rf libraqm ImageMagick-* ImageMagick.tar.gz \
    && apk del \
        build-base \
        meson \
        ninja \
        curl \
        git \
    && rm -rf /var/cache/* /root/.cache /tmp/* /usr/share/man /usr/share/doc /usr/include

# Install Python and PowerShell dependencies
RUN pwsh -NoProfile -Command "Set-PSRepository -Name PSGallery -InstallationPolicy Trusted; \
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
