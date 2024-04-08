## Getting Started

1. Make sure to obtain all the api keys and tokens as you will need them later on for the `config.json`.
    - **TMDB API Read Access Token:** [Obtain TMDB API Token](https://www.themoviedb.org/settings/api)
        - **NOTE** the **TMDB API Read Access Token** is the really, really long one
    - **Fanart Personal API Key:** [Obtain Fanart API Key](https://fanart.tv/get-an-api-key)
    - **TVDB API Key:** [Obtain TVDB API Key](https://thetvdb.com/api-information/signup)
        - **Do not** use `"Legacy API Key"`, it only works with a Project Api Key.
    - **Plex Token:** [Optain Plex Token](https://support.plex.tv/articles/204059436-finding-an-authentication-token-x-plex-token/)

1. For Docker please continue here: [Docker](#docker)

1. Please install Powershell
    - [Linux](https://learn.microsoft.com/en-us/powershell/scripting/install/installing-powershell-on-linux?view=powershell-7.4)
    - [macOS](https://learn.microsoft.com/en-us/powershell/scripting/install/installing-powershell-on-macos?view=powershell-7.4)
    - [Windows](https://learn.microsoft.com/en-us/powershell/scripting/install/installing-powershell-on-windows?view=powershell-7.4)
1. If you are on Windows/Linux next step is to clone the repo.
    - switch into the directory on your server where you want the project to land. (Make sure you have git installed)
        
        Linux:
        ```bash
        cd /opt/appdata
        ```

        Windows:
        ```bash
        cd C:\Github
        ```
        - [Git for Windows](https://git-scm.com/download/win)
        - [Git for Linux](https://git-scm.com/download/linux)
    - Clone the Repo:
        ```bash
        git clone https://github.com/fscorrupt/Posterizarr.git
        ```
    - After that you can switch into the cloned Repo/Folder
        ```bash
        cd Posterizarr
        ```
    - You should see something like this:
        ```
        .
        ├── backgroundoverlay.png
        ├── config.example.json
        ├── docker-compose.yml
        ├── images
        │   ├── backgrounds.png
        │   ├── backgroundtesting.png
        │   ├── folder.png
        │   ├── imagecsv.png
        │   ├── movies4kpmm.png
        │   ├── movies_pmm.png
        │   ├── movies.png
        │   ├── output.png
        │   ├── seasonspmm.png
        │   ├── showspmm.png
        │   ├── shows.png
        │   ├── testing.png
        │   ├── titlecards.png
        │   ├── titlecardtesting.png
        │   ├── webhookexample.png
        │   └── webhook.png
        ├── overlay.png
        ├── Posterizarr.ps1
        ├── README.md
        ├── Release.txt
        └── Rocky.ttf
1. Copy the `config.example.json` to `config.json` and adjust the settings.
    - Enter all the api keys and tokens from **Getting Started - Step 1** under the `ApiPart` [Detailed Config Description](https://github.com/fscorrupt/Posterizarr?tab=readme-ov-file#configuration)
        - tvdbapi
        - tmdbtoken
        - FanartTvAPIKey
        - PlexToken
    - If you are happy with the default values, you should still ensure that the AssetPath value is set properly.
        - On Linux, like this: `/PathToAsset/Dir`
        - On Windows, like this: `C:\\PathToAsset\\Dir` 
            - **Important** - you have to use double `\\` in Json.
1. Please start the Script **(On first run, ensure its run as Administrator/Sudo, because it has to install a Powershell Module)**
    - Linux: 
        ```
        cd /opt/appdata/Posterizarr
        sudo pwsh Posterizarr.ps1
        ```
    - Windows: 
        
        Open the Start menu, type Windows PowerShell, select Windows PowerShell, and then select Run as administrator
        ```
        cd C:\Github\Posterizarr
        .\Posterizarr.ps1
        ```
1. After that it is recommended to run the script in `-Testing` Mode.
    
    *In this Mode, the script will create sample posters according to the config settings so you can see how it would look before you mass run it against your libraries. These samples will be created in the `test` directory*
    
    *You can find examples and more information here:* 
    
    *[Info about Testing mode](https://github.com/fscorrupt/Posterizarr?tab=readme-ov-file#testing-mode)*
    
    *[Example Images](https://github.com/fscorrupt/Posterizarr?tab=readme-ov-file#images-from-testing-mode)*
    
    - Linux:
        ```
        cd /opt/appdata/Posterizarr
        pwsh Posterizarr.ps1 -Testing
        ```
    - Windows:
        ```
        cd C:\Github\Posterizarr
        .\Posterizarr.ps1 -Testing
        ```
5. You can now fine tune all the `width, height, color` of `borders, text boxes and text` in config.json
    - After each change of a setting just rerun the script in `-Testing` mode so you can see how it looks.
6. The final step is to set a schedule and let the script run.
    - You can also trigger the poster creation on-demand, like this:
        - Linux:
            ```
            cd /opt/appdata/Posterizarr
            pwsh Posterizarr.ps1
            ```
        - Windows:
            ```
            cd C:\Github\Posterizarr
            .\Posterizarr.ps1
            ```
    - Configure Scheduled runs:
    
        Linux:
        - Cron example:
            ```
            sudo crontab -e
            ```
            add a new line like this (every 2 hours):

            ```
            0 */2 * * * docker exec posterizarr pwsh Posterizarr.ps1 >/dev/null 2>&1
            ```
    
        Windows:
        - You can create a schedule task -> [How-To](https://www.sharepointdiary.com/2013/03/create-scheduled-task-for-powershell-script.html)
## Docker
1. Adjust the [docker-compose.yml](https://github.com/fscorrupt/Posterizarr/raw/main/docker-compose.yml) to fit your environment.
    - Required environment variables and descriptions can be found [here](https://github.com/fscorrupt/Posterizarr?tab=readme-ov-file#docker)
        ```yml
        ---
        version: "3"
        services:
        posterizarr:
            hostname: "posterizarr"
            container_name: "posterizarr"
            environment:
            - "PGID=1000"
            - "PUID=1000"
            - "TZ=Europe/Berlin"
            - "UMASK=022"
            - "TERM=xterm"
            - "RUN_TIME=10:30,19:30"
            image: "ghcr.io/fscorrupt/docker-posterizarr:latest"
            restart: "unless-stopped"
            networks:
            - "proxy"
            volumes:
            - "/opt/appdata/posterizarr:/config:rw"
        networks:
        proxy:
            driver: bridge
            external: true
        ```
2. Switch to the Directory where you want to build/start the container and place the `docker-compose.yml` there.
    - Linux:
        ```
        cd /opt/appdata
        mkdir Posterizarr
        cd Posterizarr
        docker compose -up -d
        ```
    - Windows:
        ```
        cd C:\Github
        mkdir Posterizarr
        cd Posterizarr
        docker compose -up -d
        ```
    - Now it should download everything and start up your container.
3. On first run the container will download the required files and also create the folder structure for you.
4. Copy the `config.example.json` to `config.json` and adjust the settings.
    - Enter all the api keys and tokens from **Getting Started - Step 1** under the `ApiPart` [Detailed Config Description](https://github.com/fscorrupt/Posterizarr?tab=readme-ov-file#configuration)
        - tvdbapi
        - tmdbtoken
        - FanartTvAPIKey
        - PlexToken
    - If you are happy with the default values, you should still ensure that the AssetPath value is set properly.
        - On Linux, like this: `/PathToAsset/Dir`
        - On Docker you have to use the binded volume path you specified in `docker-compose.yml`. If you use `/assets` without an extra volume binding it will create a folder in your scriptroot where all the artwork lands.
        - On Windows, like this: `C:\\PathToAsset\\Dir` 
            - **Important** - you have to use double `\\` in json.
1. After that it is recommended to run the script in `-Testing` Mode.
> [!TIP]
> 
>*In this Mode, the script will create sample posters according to the config settings so you can see how it would look before you mass run it against your libraries. These samples will be created in the `test` directory*
>
>*You can find examples and more information here:*
>    
>*[Info about Testing mode](https://github.com/fscorrupt/Posterizarr?tab=readme-ov-file#testing-mode)*
>    
>*[Example Images](https://github.com/fscorrupt/Posterizarr?tab=readme-ov-file#images-from-testing-mode)*
    
    - Docker 
    
        In this example `posterizarr` is the container name
        ```sh
        docker exec -it posterizarr pwsh Posterizarr.ps1 -Testing
        ```
5. You can now fine tune all the `width, height, color` of `borders, text boxes and text` in config.json
    - After each change of a setting just rerun the script in `-Testing` mode so you can see how it looks.
6. The final step is to set a schedule and let the script run.
    - You can also trigger the poster creation on-demand, like this:
        ```sh
        docker exec -it posterizarr pwsh Posterizarr.ps1
        ```
> [!TIP]
> If you are an unRAID user, install the `Docker Compose Manager` plugin from the Community Apps store so that you can leverage the compose file
