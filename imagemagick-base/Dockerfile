FROM docker.io/library/python:3.13-alpine AS builder

ARG TARGETARCH
ARG VENDOR
ARG VERSION

ENV TZ="Europe/Berlin" \
    FONTS_GID=5555 \
    FONTCONFIG_CACHE_DIR="/var/cache/fontconfig"

# Install build tools, runtime dependencies, libraqm, and ImageMagick with raqm support
RUN apk add --no-cache \
    meson \
    ninja \
    curl \
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
    pkgconfig

# Build and install libraqm
RUN git clone https://github.com/HOST-Oman/libraqm.git && \
    cd libraqm && \
    meson setup build && \
    meson compile -C build && \
    meson install -C build && \
    cd .. && rm -rf libraqm

# Build and install ImageMagick
RUN wget https://imagemagick.org/download/ImageMagick.tar.gz && \
    tar -xzf ImageMagick.tar.gz && \
    cd ImageMagick-* && \
    ./configure --with-raqm=yes --disable-dependency-tracking && \
    make -j$(nproc) && \
    make install && \
    cd .. && rm -rf ImageMagick-* ImageMagick.tar.gz

FROM docker.io/library/python:3.13-alpine

ENV TZ="Europe/Berlin" \
    FONTCONFIG_CACHE_DIR="/var/cache/fontconfig" \
    LD_LIBRARY_PATH="/usr/local/lib" \
    FONTS_GID=5555 \
    FONTCONFIG_CACHE_DIR="/var/cache/fontconfig"

# Install only runtime dependencies
RUN apk add --no-cache \
    fontconfig \
    libjpeg-turbo \
    pango \
    tzdata

# Copy compiled ImageMagick + libraqm libs from builder
COPY --from=builder /usr/local /usr/local
