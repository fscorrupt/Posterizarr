FROM python:3.13-alpine

ARG TARGETARCH
ARG VENDOR
ARG VERSION
    
ENV UMASK="0002" \
    TZ="Europe/Berlin"
    
# Install build tools, runtime dependencies, libraqm, and ImageMagick with raqm support
RUN apk add --no-cache \
        meson \
        ninja \
        curl \
        fontconfig \
        libjpeg-turbo \
        pango \
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
