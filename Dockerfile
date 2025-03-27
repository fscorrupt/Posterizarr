FROM docker.io/library/python:3.13-alpine

ENV UMASK="0002" \
    TZ="Etc/UTC" \
    DEBCONF_NONINTERACTIVE_SEEN="true" \
    DEBIAN_FRONTEND="noninteractive" \
    POWERSHELL_DISTRIBUTION_CHANNEL="PSDocker"
RUN \
    apk add --no-cache \
        catatonit \
        curl \
        imagemagick  \
        imagemagick-heic \
        imagemagick-jpeg \
        libjpeg-turbo \
        powershell \
        tzdata \
    && \
    pwsh -Command "Set-PSRepository -Name PSGallery -InstallationPolicy Trusted; \
        Install-Module -Name FanartTvAPI -Scope AllUsers -Force" \
    && chmod -R 755 /usr/local/share/powershell \
    && pip install apprise \
    && mkdir -p /app && chmod 755 /app

COPY entrypoint.sh /entrypoint.sh

COPY . /app/

USER nobody:nogroup

WORKDIR /app

VOLUME ["/app"]

ENTRYPOINT ["/usr/bin/catatonit", "--", "/entrypoint.sh"]

LABEL org.opencontainers.image.description="Posterizarr - Automated poster generation for Plex/Jellyfin/Emby media libraries"
LABEL org.opencontainers.image.licenses="GPL-3.0"