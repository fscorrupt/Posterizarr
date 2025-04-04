#!/bin/sh
echo "User:group" $(id -u):$(id -g)
# Change ownership of the directory to match the runtime user/group
chown -R $(id -u):$(id -g) /usr/share/fonts/custom /var/cache/fontconfig 

# Execute the main container process
exec \
    pwsh \
        -NoProfile \
        /app/Start.ps1 \
        "$@"