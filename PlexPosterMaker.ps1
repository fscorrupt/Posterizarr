param (
    [switch]$Manual,
    [switch]$Testing
)

$global:HeaderWritten = $null
#################
# What you need #
#####################################################################################################################
# TMDB API Read Access Token    -> https://www.themoviedb.org/settings/api
# FANART API                    -> https://fanart.tv/get-an-api-key
# TVDB API                      -> https://thetvdb.com/api-information/signup
# ImageMagick                   -> https://imagemagick.org/archive/binaries/ImageMagick-7.1.1-27-Q16-HDRI-x64-dll.exe
# FanartTvAPI Module            -> https://github.com/Celerium/FanartTV-PowerShellWrapper
#####################################################################################################################
function Write-Log {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path,

        [Parameter(Mandatory = $false)]
        [string]$Message,

        [Parameter(Mandatory = $true)]
        [ValidateSet('Info', 'Warning', 'Error', 'Optional', 'Debug', 'Trace', 'Success')]
        [string]$Type,

        [string]$Subtext = $null
    )
    switch ($Type) {
        'Info' { $Color = "white" }
        'Warning' { $Color = "yellow" }
        'Error' { $Color = "red" }
        'Optional' { $Color = "blue" }
        'Debug' { $Color = "darkmagenta" }
        'Trace' { $Color = "cyan" }
        'Success' { $Color = "green" }
    }
    # ASCII art header
    if (-not $global:HeaderWritten) {
        $Header = @"
===============================================================================
  ____  _             ____           _              __  __       _             
 |  _ \| | _____  __ |  _ \ ___  ___| |_ ___ _ __  |  \/  | __ _| | _____ _ __ 
 | |_) | |/ _ \ \/ / | |_) / _ \/ __| __/ _ \ '__| | |\/| |/ _``` | |/ / _ \ '__|
 |  __/| |  __/>  <  |  __/ (_) \__ \ ||  __/ |    | |  | | (_| |   <  __/ |   
 |_|   |_|\___/_/\_\ |_|   \___/|___/\__\___|_|    |_|  |_|\__,_|_|\_\___|_|   

===============================================================================
"@
        Write-Host $Header
        $Header | Out-File $Path -Append 
        $global:HeaderWritten = $true
    }
    $Timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    $PaddedType = $Type.PadRight(8)
    $TypeFormatted = "[{0}] {1}" -f $Timestamp, $PaddedType.ToUpper()

    if ($Message) {
        $FormattedLine1 = "{0}| {1}" -f ($TypeFormatted, $Message)
        $FormattedLineWritehost = "{0}| " -f ($TypeFormatted)
    }

    if ($Subtext) {
        $FormattedLine = "{0}|      {1}" -f ($TypeFormatted, $Subtext)
        $FormattedLineWritehost = "{0}|      " -f ($TypeFormatted)
        Write-Host $FormattedLineWritehost -NoNewline
        Write-Host $Subtext -ForegroundColor $Color
        $FormattedLine1 | Out-File $Path -Append 
        $FormattedLine | Out-File $Path -Append 
    }
    else {
        Write-Host $FormattedLineWritehost -NoNewline
        Write-Host $Message -ForegroundColor $Color
        $FormattedLine1 | Out-File $Path -Append 
    }    
}
function AddTrailingSlash($path) {
    if (-not ($path -match '[\\/]$')) {
        $path += if ($path -match '\\') { '\' } else { '/' }
    }
    return $path
}
function RemoveTrailingSlash($path) {
    if ($path -match '[\\/]$') {
        $path = $path.TrimEnd('\', '/')
    }
    return $path
}
# stolen and adapted from: https://github.com/bullmoose20/Plex-Stuff/blob/9d231d871a4676c8da7d4cbab482181a35756524/create_defaults/create_default_posters.ps1#L477 
Function Get-OptimalPointSize {
    param(
        [string]$text,
        [string]$fontImagemagick,
        [int]$box_width,
        [int]$box_height,
        [int]$min_pointsize,
        [int]$max_pointsize
    )
    # Construct the command with correct font option
    $cmd = "magick.exe -size ${box_width}x${box_height} -font `"$fontImagemagick`" -gravity center -fill black caption:`"$text`" -format `"%[caption:pointsize]`" info:"
    $cmd | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append 
    # Execute command and get point size
    $current_pointsize = [int](Invoke-Expression $cmd | Out-String).Trim()
    # Apply point size limits
    if ($current_pointsize -gt $max_pointsize) {
        $current_pointsize = $max_pointsize
    }
    elseif ($current_pointsize -lt $min_pointsize) {
        Write-log -Subtext "Text truncated! optimalFontSize: $current_pointsize below min_pointsize: $min_pointsize" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Warning
        $global:IsTruncated = $true
        $current_pointsize = $min_pointsize
    }

    # Return optimal point size
    return $current_pointsize
}
function GetTMDBMoviePoster {
    Write-log -Subtext "Searching on TMDB for a movie poster" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Trace
    if ($global:PreferTextless -eq 'True') {
        try {
            $response = (Invoke-WebRequest -Uri "https://api.themoviedb.org/3/movie/$($global:tmdbid)?append_to_response=images&language=xx&include_image_language=en,null,de" -Method GET -Headers $global:headers -ErrorAction SilentlyContinue).content | ConvertFrom-Json -ErrorAction SilentlyContinue    
        }
        catch {
        }
        if ($response) {
            if ($response.images.posters) {
                $NoLangPoster = ($response.images.posters | Where-Object iso_639_1 -eq $null)
                if (!$NoLangPoster) {
                    $posterpath = (($response.images.posters | Sort-Object vote_average -Descending)[0]).file_path
                    $global:posterurl = "https://image.tmdb.org/t/p/original$posterpath"
                    if ($global:FavProvider -eq 'TMDB') {
                        $global:Fallback = "fanart"
                        $global:tmdbfallbackposterurl = $global:posterurl
                    }
                    Write-log -Subtext "Found Poster with text on TMDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Optional
                    $global:PosterWithText = $true
                }
                Else {
                    $posterpath = (($response.images.posters | Where-Object iso_639_1 -eq $null | Sort-Object vote_average -Descending)[0]).file_path
                    if ($posterpath) {
                        $global:posterurl = "https://image.tmdb.org/t/p/original$posterpath"
                        Write-log -Subtext "Found Textless Poster on TMDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Success
                        $global:TextlessPoster = $true
                        return $global:posterurl
                    }
                }
            }
        }
        Else {
            Write-log -Subtext "TMDB Api Response is null" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Error
        }
    }
    Else {
        try {
            $response = (Invoke-WebRequest -Uri "https://api.themoviedb.org/3/movie/$($global:tmdbid)?append_to_response=images&language=$($PreferedLanguageOrder[0])&include_image_language=$($global:PreferedLanguageOrderTMDB -join ',')" -Method GET -Headers $global:headers -ErrorAction SilentlyContinue).content | ConvertFrom-Json -ErrorAction SilentlyContinue    
        }
        catch {
        }
        if ($response) {
            if ($response.images.posters) {
                foreach ($lang in $global:PreferedLanguageOrderTMDB) {
                    if ($lang -eq 'null') {
                        $FavPoster = ($response.images.posters | Where-Object iso_639_1 -eq $null)
                    }
                    Else {
                        $FavPoster = ($response.images.posters | Where-Object iso_639_1 -eq $lang)
                    }
                    if ($FavPoster) {
                        $posterpath = (($FavPoster | Sort-Object vote_average -Descending)[0]).file_path
                        $global:posterurl = "https://image.tmdb.org/t/p/original$posterpath"
                        if ($lang -eq 'null') {
                            Write-log -Subtext "Found Poster without Language on TMDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Optional
                        }
                        Else {
                            Write-log -Subtext "Found Poster with Language '$lang' on TMDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Optional
                        }
                        if ($lang -ne 'null') {
                            $global:PosterWithText = $true
                        }
                        return $global:posterurl
                        break
                    }
                }
            }
        }
        Else {
            Write-log -Subtext "TMDB Api Response is null" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Error
        }
    }
}
function GetTMDBShowPoster {
    Write-log -Subtext "Searching on TMDB for a show poster" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Trace
    if ($global:PreferTextless -eq 'True') {
        try {
            $response = (Invoke-WebRequest -Uri "https://api.themoviedb.org/3/tv/$($global:tmdbid)?append_to_response=images&language=xx&include_image_language=en,null,de" -Method GET -Headers $global:headers -ErrorAction SilentlyContinue).content | ConvertFrom-Json -ErrorAction SilentlyContinue    
        }
        catch {
        }
        if ($response) {
            if ($response.images.posters) {
                $NoLangPoster = ($response.images.posters | Where-Object iso_639_1 -eq $null)
                if (!$NoLangPoster) {
                    $posterpath = (($response.images.posters | Sort-Object vote_average -Descending)[0]).file_path
                    $global:posterurl = "https://image.tmdb.org/t/p/original$posterpath"
                    if ($global:FavProvider -eq 'TMDB') {
                        $global:Fallback = "fanart"
                        $global:tmdbfallbackposterurl = $global:posterurl
                    }
                    Write-log -Subtext "Found Poster with text on TMDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Optional
                    $global:PosterWithText = $true
                    return $global:posterurl
                }
                Else {
                    $posterpath = (($response.images.posters | Where-Object iso_639_1 -eq $null | Sort-Object vote_average -Descending)[0]).file_path
                    if ($posterpath) {
                        $global:posterurl = "https://image.tmdb.org/t/p/original$posterpath"
                        Write-log -Subtext "Found Textless Poster on TMDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Success
                        $global:TextlessPoster = $true
                        return $global:posterurl
                    }
                }
            }
        }
        Else {
            Write-log -Subtext "TMDB Api Response is null" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Error
        }
    }
    Else {
        try {
            $response = (Invoke-WebRequest -Uri "https://api.themoviedb.org/3/tv/$($global:tmdbid)?append_to_response=images&language=$($PreferedLanguageOrder[0])&include_image_language=$($global:PreferedLanguageOrderTMDB -join ',')" -Method GET -Headers $global:headers -ErrorAction SilentlyContinue).content | ConvertFrom-Json -ErrorAction SilentlyContinue
        }
        catch {
        }
        if ($response) {
            if ($response.images.posters) {
                foreach ($lang in $global:PreferedLanguageOrderTMDB) {
                    if ($lang -eq 'null') {
                        $FavPoster = ($response.images.posters | Where-Object iso_639_1 -eq $null)
                    }
                    Else {
                        $FavPoster = ($response.images.posters | Where-Object iso_639_1 -eq $lang)
                    }
                    if ($FavPoster) {
                        $posterpath = (($FavPoster | Sort-Object vote_average -Descending)[0]).file_path
                        $global:posterurl = "https://image.tmdb.org/t/p/original$posterpath"
                        if ($lang -eq 'null') {
                            Write-log -Subtext "Found Poster without Language on TMDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Optional
                        }
                        Else {
                            Write-log -Subtext "Found Poster with Language '$lang' on TMDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Optional
                        }
                        if ($lang -ne 'null') {
                            $global:PosterWithText = $true
                        }
                        return $global:posterurl
                        break
                    }
                }
            }
        }
        Else {
            Write-log -Subtext "TMDB Api Response is null" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Error
        }
    }
}
function GetTMDBSeasonPoster {
    Write-log -Subtext "Searching on TMDB for Season '$global:SeasonNumber' poster" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Trace
    if ($global:PreferTextless -eq 'True') {
        try {
            $response = (Invoke-WebRequest -Uri "https://api.themoviedb.org/3/tv/$($global:tmdbid)/season/$global:SeasonNumber/images?append_to_response=images&language=xx&include_image_language=en,null,de" -Method GET -Headers $global:headers -ErrorAction SilentlyContinue).content | ConvertFrom-Json -ErrorAction SilentlyContinue            
        }
        catch {
        }
        if ($response) {
            if ($response.posters) {
                $NoLangPoster = ($response.posters | Where-Object iso_639_1 -eq $null)
                if (!$NoLangPoster) {
                    $posterpath = (($response.posters | Sort-Object vote_average -Descending)[0]).file_path
                    $global:posterurl = "https://image.tmdb.org/t/p/original$posterpath"
                    Write-log -Subtext "Found Poster with text on TMDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Optional
                    $global:PosterWithText = $true
                    return $global:posterurl
                }
                Else {
                    $posterpath = (($response.posters | Where-Object iso_639_1 -eq $null | Sort-Object vote_average -Descending)[0]).file_path
                    if ($posterpath) {
                        $global:posterurl = "https://image.tmdb.org/t/p/original$posterpath"
                        Write-log -Subtext "Found Textless Poster on TMDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Success
                        $global:TextlessPoster = $true
                        return $global:posterurl
                    }
                }
            }
            Else {
                Write-log -Subtext "TMDB Api Response is null" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type error
            }
        }
        Else {
            Write-log -Subtext "No Season Poster on TMDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Warning
        }
    }
    Else {
        try {
            if ($global:SeasonNumber -match '\b\d{1,2}\b'){
                $response = (Invoke-WebRequest -Uri "https://api.themoviedb.org/3/tv/$($global:tmdbid)/season/$global:SeasonNumber/images?append_to_response=images&language=$($global:PreferedLanguageOrder[0])&include_image_language=$($global:PreferedLanguageOrderTMDB -join ',')" -Method GET -Headers $global:headers -ErrorAction SilentlyContinue).content | ConvertFrom-Json -ErrorAction SilentlyContinue
            }
            Else {
                $responseBackup = (Invoke-WebRequest -Uri "https://api.themoviedb.org/3/tv/$($global:tmdbid)?append_to_response=images&language=$($PreferedLanguageOrder[0])&include_image_language=$($global:PreferedLanguageOrderTMDB -join ',')" -Method GET -Headers $global:headers -ErrorAction SilentlyContinue).content | ConvertFrom-Json -ErrorAction SilentlyContinue
            }
        }
        catch {
        }
        if ($responseBackup) {
            if ($responseBackup.images.posters) {
                Write-log -Subtext "Could not get a result with '$global:SeasonNumber' on TMDB, likley season number not in correct format, fallback to Show poster." -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Optional
                foreach ($lang in $global:PreferedLanguageOrderTMDB) {
                    if ($lang -eq 'null') {
                        $FavPoster = ($responseBackup.images.posters | Where-Object iso_639_1 -eq $null)
                    }
                    Else {
                        $FavPoster = ($responseBackup.images.posters | Where-Object iso_639_1 -eq $lang)
                    }
                    if ($FavPoster) {
                        $posterpath = (($FavPoster | Sort-Object vote_average -Descending)[0]).file_path
                        $global:posterurl = "https://image.tmdb.org/t/p/original$posterpath"
                        if ($lang -eq 'null') {
                            Write-log -Subtext "Found Poster without Language on TMDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Optional
                        }
                        Else {
                            Write-log -Subtext "Found Poster with Language '$lang' on TMDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Optional
                        }
                        if ($lang -ne 'null') {
                            $global:PosterWithText = $true
                        }
                        return $global:posterurl
                        break
                    }
                }
            }
        }
        if ($response) {
            if ($response.posters) {
                foreach ($lang in $global:PreferedLanguageOrderTMDB) {
                    if ($lang -eq 'null') {
                        $FavPoster = ($response.posters | Where-Object iso_639_1 -eq $null)
                    }
                    Else {
                        $FavPoster = ($response.posters | Where-Object iso_639_1 -eq $lang)
                    }
                    if ($FavPoster) {
                        $posterpath = (($FavPoster | Sort-Object vote_average -Descending)[0]).file_path
                        $global:posterurl = "https://image.tmdb.org/t/p/original$posterpath"
                        if ($lang -eq 'null') {
                            Write-log -Subtext "Found Poster without Language on TMDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Optional
                        }
                        Else {
                            Write-log -Subtext "Found Poster with Language '$lang' on TMDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Optional
                        }
                        if ($lang -ne 'null') {
                            $global:PosterWithText = $true
                        }
                        return $global:posterurl
                        break
                    }
                }
            }
            Else {
                Write-log -Subtext "TMDB Api Response is null" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type error
            }
        }
        Else {
            Write-log -Subtext "No Season Poster on TMDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Warning
        }

    }
}
function GetFanartMoviePoster {
    $global:Fallback = $null
    Write-log -Subtext "Searching on Fanart.tv for a movie poster" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Trace
    if ($global:PreferTextless -eq 'True') {
        $ids = @($global:tmdbid, $global:tvdbid, $global:imdbid)
        $entrytemp = $null
        
        foreach ($id in $ids) {
            if ($id) {
                $entrytemp = Get-FanartTv -Type movies -id $id -ErrorAction SilentlyContinue
                if ($entrytemp -and $entrytemp.movieposter) {
                    if (!($entrytemp.movieposter | Where-Object lang -eq '00')) {
                        $global:posterurl = ($entrytemp.movieposter)[0].url
                        Write-log -Subtext "Found Poster with text on Fanart.tv"  -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Optional
                        $global:PosterWithText = $true
                        if ($global:FavProvider -eq 'FANART') {
                            $global:Fallback = "TMDB"
                            $global:fanartfallbackposterurl = ($entrytemp.movieposter)[0].url
                        }
                        break
                    }
                    Else {
                        $global:posterurl = ($entrytemp.movieposter | Where-Object lang -eq '00')[0].url
                        Write-log -Subtext "Found Textless Poster on Fanart.tv" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Success
                        $global:TextlessPoster = $true
                        break
                    }
                }
            }
        }

        if (!$global:posterurl) {
            Write-log -Subtext "No movie match or poster found on Fanart.tv" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Warning
            $global:Fallback = "TMDB"
        }
        Else {
            return $global:posterurl
        }
    }
    Else {
        $ids = @($global:tmdbid, $global:tvdbid, $global:imdbid)
        $entrytemp = $null
        
        foreach ($id in $ids) {
            if ($id) {
                $entrytemp = Get-FanartTv -Type movies -id $id -ErrorAction SilentlyContinue
                if ($entrytemp -and $entrytemp.movieposter) {
                    foreach ($lang in $global:PreferedLanguageOrderFanart) {
                        if (($entrytemp.movieposter | Where-Object lang -eq "$lang")) {
                            $global:posterurl = ($entrytemp.movieposter)[0].url
                            if ($lang -eq '00') {
                                Write-log -Subtext "Found Poster without Language on FANART" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Optional
                            }
                            Else {
                                Write-log -Subtext "Found Poster with Language '$lang' on FANART" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Optional
                            }
                            if ($lang -ne '00') {
                                $global:PosterWithText = $true
                            }
                            break
                        }
                    }
                }
            }
        }

        if (!$global:posterurl) {
            Write-log -Subtext "No movie match or poster found on Fanart.tv" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Warning
            $global:Fallback = "TMDB"
        }
        Else {
            return $global:posterurl
        }
    }
}
function GetFanartShowPoster {
    $global:Fallback = $null
    Write-log -Subtext "Searching on Fanart.tv for a show poster" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Trace
    if ($global:PreferTextless -eq 'True') {
        $ids = @($global:tmdbid, $global:tvdbid, $global:imdbid)
        $entrytemp = $null

        foreach ($id in $ids) {
            if ($id) {
                $entrytemp = Get-FanartTv -Type tv -id $id -ErrorAction SilentlyContinue
                if ($entrytemp -and $entrytemp.tvposter) {
                    if (!($entrytemp.tvposter | Where-Object lang -eq '00')) {
                        $global:posterurl = ($entrytemp.tvposter)[0].url

                        Write-log -Subtext "Found Poster with text on Fanart.tv" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Optional
                        $global:PosterWithText = $true
                        if ($global:FavProvider -eq 'FANART') {
                            $global:Fallback = "TMDB"
                            $global:fanartfallbackposterurl = ($entrytemp.tvposter)[0].url
                        }
                        break
                    }
                    Else {
                        $global:posterurl = ($entrytemp.tvposter | Where-Object lang -eq '00')[0].url
                        Write-log -Subtext "Found Textless Poster on Fanart.tv" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Success
                        $global:TextlessPoster = $true
                        break
                    }
                }
            }
        }

        if (!$global:posterurl) {

            Write-log -Subtext "No show match or poster found on Fanart.tv" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Warning
            
            $global:Fallback = "TMDB"
        }
        Else {
            return $global:posterurl
        }
    }
    Else {
        $ids = @($global:tmdbid, $global:tvdbid, $global:imdbid)
        $entrytemp = $null

        foreach ($id in $ids) {
            if ($id) {
                $entrytemp = Get-FanartTv -Type tv -id $id -ErrorAction SilentlyContinue
                if ($entrytemp -and $entrytemp.tvposter) {
                    foreach ($lang in $global:PreferedLanguageOrderFanart) {
                        if (($entrytemp.tvposter | Where-Object lang -eq "$lang")) {
                            $global:posterurl = ($entrytemp.tvposter)[0].url
                            if ($lang -eq '00') {
                                Write-log -Subtext "Found Poster without Language on FANART" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Optional
                            }
                            Else {
                                Write-log -Subtext "Found Poster with Language '$lang' on FANART" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Optional
                            }
                            if ($lang -ne '00') {
                                $global:PosterWithText = $true
                            }
                            break
                        }
                    }
                }
            }
        }

        if (!$global:posterurl) {

            Write-log -Subtext "No show match or poster found on Fanart.tv" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Warning
            
            $global:Fallback = "TMDB"
        }
        Else {
            return $global:posterurl
        }
    }
}
function GetFanartSeasonPoster {
    Write-log -Subtext "Searching on Fanart.tv for Season '$global:SeasonNumber' poster" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Trace
    $ids = @($global:tmdbid, $global:tvdbid, $global:imdbid)
    $entrytemp = $null
    if ($global:PreferTextless -eq 'True') {
        foreach ($id in $ids) {
            if ($id) {
                $entrytemp = Get-FanartTv -Type tv -id $id -ErrorAction SilentlyContinue
                if ($entrytemp.seasonposter) {
                    if ($global:SeasonNumber -match '\b\d{1,2}\b'){
                        $global:posterurl = ($entrytemp.seasonposter | Where-Object { $_.lang -eq 'en' -and $_.Season -eq $global:SeasonNumber } | Sort-Object likes)[0].url
                    }
                    Else {
                        Write-log -Subtext "Could not get a result with '$global:SeasonNumber' on Fanart, likley season number not in correct format, fallback to Show poster." -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Optional
                        if ($entrytemp -and $entrytemp.tvposter) {
                            $BackupPoster
                            foreach ($lang in $global:PreferedLanguageOrderFanart) {
                                if (($entrytemp.tvposter | Where-Object lang -eq "$lang")) {
                                    $global:posterurl = ($entrytemp.tvposter)[0].url
                                    if ($lang -eq '00') {
                                        Write-log -Subtext "Found Poster without Language on FANART" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Optional
                                    }
                                    Else {
                                        Write-log -Subtext "Found Poster with Language '$lang' on FANART" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Optional
                                    }
                                    if ($lang -ne '00') {
                                        $global:PosterWithText = $true
                                    }
                                    break
                                }
                            }
                        }
                    }
                    break
                }
                Else {
                    $global:posterurl = $null
                    break
                }
            }
        }
        if ($global:posterurl -and !$BackupPoster) {
            Write-log -Subtext "Found season poster on Fanart" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Trace
            return $global:posterurl
        }
        Else {
            Write-log -Subtext "No Season Poster on Fanart" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Warning
        }
    }
    Else {
        foreach ($id in $ids) {
            if ($id) {
                $entrytemp = Get-FanartTv -Type tv -id $id -ErrorAction SilentlyContinue
                if ($entrytemp.seasonposter) {
                    foreach ($lang in $global:PreferedLanguageOrderFanart) {
                        $global:posterurl = ($entrytemp.seasonposter | Where-Object { $_.lang -eq "$lang" -and $_.Season -eq $global:SeasonNumber } | Sort-Object likes)[0].url
                        break
                    }
                }
                Else {
                    $global:posterurl = $null
                    break
                }
            }
        }
        if ($global:posterurl) {
            Write-log -Subtext "Found season poster on Fanart" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Trace
            return $global:posterurl
        }
        Else {
            Write-log -Subtext "No Season Poster on Fanart" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Warning
        }
    }
}
function GetTVDBMoviePoster {
    if ($global:tvdbid) {
        if ($global:PreferTextless -eq 'True') {
            Write-log -Subtext "Searching on TVDB for a movie poster" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Trace
            try {
                $response = (Invoke-WebRequest -Uri "https://api4.thetvdb.com/v4/movies/$($global:tvdbid)/extended" -Method GET -Headers $global:tvdbheader).content | ConvertFrom-Json
            }
            catch {
            }
            if ($response) {
                if ($response.data.artworks) {
                    $global:posterurl = ($response.data.artworks | Where-Object { $_.language -eq $null -and $_.type -eq '14' } | Sort-Object Score)[0].image
                    Write-log -Subtext "Found Textless Poster on TVDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Optional
                    return $global:posterurl
                }
                Else {
                    Write-log -Subtext "No Poster found on TVDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Warning
                }
            }
            Else {
                Write-log -Subtext "TVDB Api Response is null" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Error
            }
        }
        Else {
            Write-log -Subtext "Searching on TVDB for a movie poster" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Trace
            try {
                $response = (Invoke-WebRequest -Uri "https://api4.thetvdb.com/v4/movies/$($global:tvdbid)/extended" -Method GET -Headers $global:tvdbheader).content | ConvertFrom-Json
            }
            catch {
            }
            if ($response) {
                if ($response.data.artworks) {
                    foreach ($lang in $global:PreferedLanguageOrderTVDB) {
                        if ($lang -eq 'null') {
                            $LangArtwork = ($response.data.artworks | Where-Object { $_.language -like "" -and $_.type -eq '14' } | Sort-Object Score)
                        }
                        Else {
                            $LangArtwork = ($response.data.artworks | Where-Object { $_.language -like "$lang*" -and $_.type -eq '14' } | Sort-Object Score)
                        }
                        if ($LangArtwork) {
                            $global:posterurl = $LangArtwork[0].image
                            if ($lang -eq 'null') {
                                Write-log -Subtext "Found Poster without Language on TVDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Optional
                            }
                            Else {
                                Write-log -Subtext "Found Poster with Language '$lang' on TVDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Optional
                            }
                            if ($lang -ne 'null') {
                                $global:PosterWithText = $true
                            }
                            return $global:posterurl
                            break
                        }
                    }
                }
                Else {
                    Write-log -Subtext "No Poster found on TVDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Warning
                }
            }
            Else {
                Write-log -Subtext "TVDB Api Response is null" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Error
            }
        }
    }
}
function GetTVDBShowPoster {
    if ($global:tvdbid) {
        Write-log -Subtext "Searching on TVDB for a poster" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Trace
        if ($global:PreferTextless -eq 'True') {
            try {
                $response = (Invoke-WebRequest -Uri "https://api4.thetvdb.com/v4/series/$($global:tvdbid)/artworks" -Method GET -Headers $global:tvdbheader).content | ConvertFrom-Json
            }
            catch {
            }
            if ($response) {
                if ($response.data) {
                    $defaultImageurl = $response.data.image
                    $NoLangImageUrl = $response.data.artworks | where { $_.language -eq $null -and $_.type -eq '2' }
                    if ($NoLangImageUrl) {
                        $global:posterurl = $NoLangImageUrl[0].image
                        Write-log -Subtext "Found Textless Poster on TVDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Optional
                        $global:TextlessPoster = $true
                    }
                    Else {
                        $global:posterurl = $defaultImageurl
                        Write-log -Subtext "Found Poster with text on TVDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Optional
                    }
                    return $global:posterurl
                }
                Else {
                    Write-log -Subtext "No Poster found on TVDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Warning
                }
            }
            Else {
                Write-log -Subtext "TVDB Api Response is null" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Error
            }
        }
        Else {
            try {
                $response = (Invoke-WebRequest -Uri "https://api4.thetvdb.com/v4/series/$($global:tvdbid)/artworks" -Method GET -Headers $global:tvdbheader).content | ConvertFrom-Json
            }
            catch {
            }
            if ($response) {
                if ($response.data) {
                    foreach ($lang in $global:PreferedLanguageOrderTVDB) {
                        if ($lang -eq 'null') {
                            $LangArtwork = ($response.data.artworks | Where-Object { $_.language -like "" -and $_.type -eq '2' } | Sort-Object Score)
                        }
                        Else {
                            $LangArtwork = ($response.data.artworks | Where-Object { $_.language -like "$lang*" -and $_.type -eq '2' } | Sort-Object Score)
                        }
                        if ($LangArtwork) {
                            $global:posterurl = $LangArtwork[0].image
                            if ($lang -eq 'null') {
                                Write-log -Subtext "Found Poster without Language on TVDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Optional
                            }
                            Else {
                                Write-log -Subtext "Found Poster with Language '$lang' on TVDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Optional
                            }
                            if ($lang -ne 'null') {
                                $global:PosterWithText = $true
                            }
                            return $global:posterurl
                            break
                        }
                    }
                }
                Else {
                    Write-log -Subtext "No Poster found on TVDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Warning
                }
            }
            Else {
                Write-log -Subtext "TVDB Api Response is null" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Error
            }
        }
    }
}
function GetIMDBPoster {
    $response = Invoke-WebRequest -Uri "https://www.imdb.com/title/$($global:imdbid)/mediaviewer" -Method GET
    $global:posterurl = $response.images.src[1]
    if (!$global:posterurl) {
        Write-log -Subtext "No show match or poster found on IMDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Warning
    }
    Else {
        Write-log -Subtext "Found Poster with text on IMDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Optional
        return $global:posterurl
    }
}
$startTime = Get-Date
# Check if Config file is present
if (!(Test-Path "$PSScriptRoot\config.json")) {
    Write-log -Message "Config File missing, downloading it for you..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
    Invoke-WebRequest -uri "https://github.com/fscorrupt/Plex-Poster-Maker/raw/main/config.example.json" -OutFile "$PSScriptRoot\config.json"
    Write-log -Subtext "Config File downloaded here: '$PSScriptRoot\config.json'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
    Write-log -Subtext "Please configure the config file according to GH, exit script now..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Warning
    pause
    exit
}

# load config file
$config = Get-Content -Raw -Path "$PSScriptRoot\config.json" | ConvertFrom-Json

# Access variables from the config file
# Api Part
$global:tvdbapi = $config.ApiPart.tvdbapi
$global:tmdbtoken = $config.ApiPart.tmdbtoken
$FanartTvAPIKey = $config.ApiPart.FanartTvAPIKey
$PlexToken = $config.ApiPart.PlexToken
$global:FavProvider = $config.ApiPart.FavProvider.ToUpper()
$global:PreferedLanguageOrder = $config.ApiPart.PreferedLanguageOrder
# default Lang order if missing in config
if (!$global:PreferedLanguageOrder) {
    Write-log -Message "Lang search Order not set in Config, setting it to 'xx,en,de' for you" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Warning
    $global:PreferedLanguageOrder = "xx","en","de"
}
$global:PreferedLanguageOrderTMDB = $global:PreferedLanguageOrder.Replace('xx', 'null')
$global:PreferedLanguageOrderFanart = $global:PreferedLanguageOrder.Replace('xx', '00')
$global:PreferedLanguageOrderTVDB = $global:PreferedLanguageOrder.Replace('xx', 'null')
if ($global:PreferedLanguageOrder[0] -eq 'xx') {
    $global:PreferTextless = $true
}
Else {
    $global:PreferTextless = $false
}
# default to TMDB if favprovider missing
if (!$global:FavProvider) {
    Write-log -Message "FavProvider not set in config, setting it to 'TMDB' for you" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Warning
    $global:FavProvider = 'TMDB'
}

# Plex Part
$LibstoExclude = $config.PlexPart.LibstoExclude
$PlexUrl = $config.PlexPart.PlexUrl
# Prerequisites Part
$AssetPath = RemoveTrailingSlash $config.PrerequisitePart.AssetPath
$global:ScriptRoot = $PSScriptRoot
$magickinstalllocation = RemoveTrailingSlash $config.PrerequisitePart.magickinstalllocation
$font = "$global:ScriptRoot\temp\$($config.PrerequisitePart.font)"
$overlay = "$global:ScriptRoot\temp\$($config.PrerequisitePart.overlayfile)"
$testimage = "$global:ScriptRoot\temp\Testimage.png"
$LibraryFolders = $config.PrerequisitePart.LibraryFolders
$global:SeasonPosters = $config.PrerequisitePart.SeasonPosters
# Overlay Part
$global:ImageProcessing = $config.OverlayPart.ImageProcessing
$fontAllCaps = $config.OverlayPart.fontAllCaps
$AddBorder = $config.OverlayPart.AddBorder
$AddText = $config.OverlayPart.AddText
$AddOverlay = $config.OverlayPart.AddOverlay
$fontcolor = $config.OverlayPart.fontcolor
$bordercolor = $config.OverlayPart.bordercolor
$minPointSize = $config.OverlayPart.minPointSize
$maxPointSize = $config.OverlayPart.maxPointSize
$borderwidth = $config.OverlayPart.borderwidth
$MaxWidth = $config.OverlayPart.MaxWidth
$MaxHeight = $config.OverlayPart.MaxHeight
$text_offset = $config.OverlayPart.text_offset

$borderwidthsecond = $borderwidth + 'x' + $borderwidth
$boxsize = $MaxWidth + 'x' + $MaxHeight

$fontImagemagick = $font.replace('\', '\\')
$magick = "$magickinstalllocation\magick.exe"
$fileExtensions = @(".otf", ".ttf", ".otc", ".ttc", ".png")
$Errorcount = 0

if (!(Test-Path $global:ScriptRoot\Logs)) {
    New-Item -ItemType Directory -Path $global:ScriptRoot\Logs -Force | out-null
}

if (!(Test-Path $global:ScriptRoot\temp)) {
    New-Item -ItemType Directory -Path $global:ScriptRoot\temp -Force | out-null
}

if (!(Test-Path $AssetPath)) {
    New-Item -ItemType Directory -Path $AssetPath -Force | out-null
}

# Delete all files and subfolders within the temp directory
if (Test-Path $global:ScriptRoot\temp) {
    Remove-Item -Path $global:ScriptRoot\temp\* -Recurse -Force
}

# Test if files are present in Script root
if (!(Test-Path $overlay)) {
    Invoke-WebRequest -uri "https://github.com/fscorrupt/Plex-Poster-Maker/raw/main/overlay.png" -OutFile $global:ScriptRoot\temp\overlay.png 
}
if (!(Test-Path $font)) {
    Invoke-WebRequest -uri "https://github.com/fscorrupt/Plex-Poster-Maker/raw/main/Rocky.ttf" -OutFile $global:ScriptRoot\temp\Rocky.ttf
}

if (!$Manual -and !$Testing) {
    # cleanup old logfile
    if ((Test-Path $global:ScriptRoot\Logs\Scriptlog.log)) {
        Remove-Item $global:ScriptRoot\Logs\Scriptlog.log
    }
    if ((Test-Path $global:ScriptRoot\Logs\ImageMagickCommands.log)) {
        Remove-Item $global:ScriptRoot\Logs\ImageMagickCommands.log
    }
    if ((Test-Path $global:ScriptRoot\Logs\Scriptlog.log)) {
        Remove-Item $global:ScriptRoot\Logs\Scriptlog.log
    }
    if ((Test-Path "$global:ScriptRoot\Logs\PosterChoices.csv")) {
        Remove-Item "$global:ScriptRoot\Logs\PosterChoices.csv"
    }
    Write-log -Message "Old log files cleared..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Warning
}

# Display Current Config settings:
Write-log -Message "Current Config.json Settings" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Trace
Write-log -Subtext "___________________________________________" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Debug
# Plex Part
Write-log -Subtext "API Part" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Trace
Write-log -Subtext "| TVDB API Key:             $($global:tvdbapi[0..7] -join '')****" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
Write-log -Subtext "| TMDB API Token:           $($global:tmdbtoken[0..7] -join '')****" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
Write-log -Subtext "| Fanart API Key:           $($FanartTvAPIKey[0..7] -join '')****" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
if ($PlexToken){
    Write-log -Subtext "| Plex Token:               $($PlexToken[0..7] -join '')****" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
}
Else {
    Write-log -Subtext "| Plex Token:               No Token in Config" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
}
Write-log -Subtext "| Fav Provider:             $global:FavProvider" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
Write-log -Subtext "| Prefered Lang Order:      $($global:PreferedLanguageOrder -join ',')" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
Write-log -Subtext "Plex Part" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Trace
Write-log -Subtext "| Exluded Libs:             $($LibstoExclude -join ',')" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
Write-log -Subtext "| Plex Url:                 $($PlexUrl[0..10] -join '')****" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
Write-log -Subtext "Prerequisites Part" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Trace
Write-log -Subtext "| Asset Path:               $AssetPath" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
Write-log -Subtext "| Script Root:              $global:ScriptRoot" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
Write-log -Subtext "| Magick Location:          $magickinstalllocation" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
Write-log -Subtext "| Used Font:                $font" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
Write-log -Subtext "| Used Overlay File:        $overlay" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
Write-log -Subtext "| Create Library Folders:   $LibraryFolders" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
Write-log -Subtext "| Create Season Posters:    $LibraryFolders" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
Write-log -Subtext "OverLay Part" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Trace
Write-log -Subtext "| Process Images:           $global:ImageProcessing" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
Write-log -Subtext "| All Caps on Text:         $fontAllCaps" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
Write-log -Subtext "| Add Border to Image:      $AddBorder" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
Write-log -Subtext "| Add Text to Image:        $AddText" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
Write-log -Subtext "| Font Color:               $fontcolor" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
Write-log -Subtext "| Border Color:             $bordercolor" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
Write-log -Subtext "| Min Font Size:            $minPointSize" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
Write-log -Subtext "| Max Font Size:            $maxPointSize" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
Write-log -Subtext "| Border Width:             $borderwidth" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
Write-log -Subtext "| Text Box Width:           $MaxWidth" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
Write-log -Subtext "| Text Box Height:          $MaxHeight" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
Write-log -Subtext "| Text Box Offset:          $text_offset" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
Write-log -Subtext "___________________________________________" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Debug

Write-log -Message "Starting main Script now..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Success    

# Get files in script root with specified extensions
$files = Get-ChildItem -Path $global:ScriptRoot -File | Where-Object { $_.Extension -in $fileExtensions } -ErrorAction SilentlyContinue

# Copy files to the destination directory
foreach ($file in $files) {
    $destinationPath = Join-Path -Path $global:ScriptRoot\temp -ChildPath $file.Name
    if (!(Test-Path -LiteralPath $destinationPath)) {
        Copy-Item -Path $file.FullName -Destination $destinationPath -Force | out-null
        Write-log -Subtext "Found File: '$($file.Name)' in ScriptRoot - copy it into temp folder..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Trace
    }
}

if ($PlexToken) {
    Write-log -Message "Plex token found, checking access now..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
    if ((Invoke-WebRequest "$PlexUrl/?X-Plex-Token=$PlexToken").StatusCode -eq 200) {
        Write-log -Subtext "Plex access is working..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Success
        [xml]$Libs = (Invoke-WebRequest "$PlexUrl/library/sections/?X-Plex-Token=$PlexToken").content
    }
    Else {
        Write-log -Message "Could not access plex with this url: $PlexUrl/?X-Plex-Token=$PlexToken" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Error
        Write-log -Subtext "Please check token and access..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Error
        $Errorcount++
        pause
        exit
    }
}
Else {
    Write-log -Message "Checking Plex access now..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
    if ((Invoke-WebRequest "$PlexUrl").StatusCode -eq 200) {
        Write-log -Subtext "Plex access is working..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Success
        [xml]$Libs = (Invoke-WebRequest "$PlexUrl/library/sections").content
    }
    Else {
        Write-log -Message "Could not access plex with this url: $PlexUrl" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Error
        $Errorcount++
        Write-log -Subtext "Please check access and settings in plex..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Error
        Write-log -Message "To be able to connect to plex without Auth" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
        Write-log -Message "You have to enter your ip range in 'Settings -> Network -> List of IP addresses and networks that are allowed without auth: '192.168.1.0/255.255.255.0''" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
        pause
        exit
    }
}

if (!(Test-Path $magick)) {
    Write-log -Message "ImageMagick missing, downloading/installing it for you..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Error
    $Errorcount++
    $InstallArguments = "/verysilent /DIR=`"$magickinstalllocation`""
    Invoke-WebRequest https://imagemagick.org/archive/binaries/ImageMagick-7.1.1-27-Q16-HDRI-x64-dll.exe -OutFile $global:ScriptRoot\temp\ImageMagick-7.1.1-27-Q16-HDRI-x64-dll.exe
    Start-Process $global:ScriptRoot\temp\ImageMagick-7.1.1-27-Q16-HDRI-x64-dll.exe -ArgumentList $InstallArguments -NoNewWindow -Wait
    if (Test-Path -LiteralPath $magickinstalllocation\magick.exe) {
        Write-log -Subtext "ImageMagick installed here: $magickinstalllocation" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Success
    }
    Else {
        Write-log -Subtext "Error During installation, please manually install Imagemagick" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Error
    }
}
# check if fanart Module is installed
if (!(Get-InstalledModule -Name FanartTvAPI)) {
    Write-log -Message "FanartTvAPI Module missing, installing it for you..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Error
    $Errorcount++
    Install-Module -Name FanartTvAPI -Force -Confirm -AllowClobber
    
    Write-log -Subtext "FanartTvAPI Module installed, importing it now..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Success
    Import-Module -Name FanartTvAPI
}
# Add Fanart Api
Add-FanartTvAPIKey -Api_Key $FanartTvAPIKey

# tmdb Header
$global:headers = @{}
$global:headers.Add("accept", "application/json")
$global:headers.Add("Authorization", "Bearer $global:tmdbtoken")

# tvdb token Header
$global:apiUrl = "https://api4.thetvdb.com/v4/login"
$global:requestBody = @{
    apikey = $global:tvdbapi
} | ConvertTo-Json

# tvdb Header
$global:tvdbtokenheader = @{
    'accept'       = 'application/json'
    'Content-Type' = 'application/json'
}
# Make tvdb the POST request
$global:tvdbtoken = (Invoke-RestMethod -Uri $global:apiUrl -Headers $global:tvdbtokenheader -Method Post -Body $global:requestBody).data.token
$global:tvdbheader = @{}
$global:tvdbheader.Add("accept", "application/json")
$global:tvdbheader.Add("Authorization", "Bearer $global:tvdbtoken")

if ($Manual) {
    Write-log -Message "Manual Poster Creation Started" -Path $global:ScriptRoot\Logs\Manuallog.log -Type Debug
    $PicturePath = Read-Host "Enter path to source picture"
    $FolderName = Read-Host "Enter Media Foldername (how plex sees it)"
    $Titletext = Read-Host "Enter Movie/Show Title"
    $CreateSeasonPoster = Read-Host "Create Season Poster? (y/n)"

    $PicturePath = $PicturePath.replace('"', '')
    $FolderName = $FolderName.replace('"', '')
    $Titletext = $Titletext.replace('"', '')

    if ($LibraryFolders -eq 'true') {
        $LibraryName = Read-Host "Enter Plex Library Name"
        $LibraryName = $LibraryName.replace('"', '')
        $backgroundImageoriginal = "$AssetPath\$LibraryName\$FolderName\poster.jpg"
        if ($CreateSeasonPoster -eq 'y') {
            $SeasonPosterName = Read-Host "Enter Season Name"
            if ($SeasonPosterName -match 'Season\s+(\d+)') {
                $global:SeasonNumber = $Matches[1]
                $global:season = "Season" + $global:SeasonNumber.PadLeft(2, '0')
            }
            if ($SeasonPosterName -eq 'Specials') {
                $global:season = "Season00"
            }  
            $backgroundImageoriginal = "$AssetPath\$LibraryName\$FolderName\$global:season.jpg"
        }
    }
    Else {
        if ($CreateSeasonPoster -eq 'y') {
            $SeasonPosterName = Read-Host "Enter Season Name"
            if ($SeasonPosterName -match 'Season\s+(\d+)') {
                $global:SeasonNumber = $Matches[1]
                $global:season = "Season" + $global:SeasonNumber.PadLeft(2, '0')
            }
            if ($SeasonPosterName -eq 'Specials') {
                $global:season = "Season00"
            }  
            $backgroundImageoriginal = "$AssetPath\$($FolderName)_$global:season.jpg"
        }
    }

    $backgroundImage = "$global:ScriptRoot\temp\$FolderName.jpg"
    $backgroundImage = $backgroundImage.Replace('[', '_').Replace(']', '_').Replace('{', '_').Replace('}', '_')
    if ($global:ImageProcessing -eq 'true') {
        if ($CreateSeasonPoster -eq 'y') {
            if ($fontAllCaps -eq 'true') {
                $joinedTitle = $SeasonPosterName.ToUpper()
            }
            Else {
                $joinedTitle = $SeasonPosterName
            }
        }
        Else {
            if ($fontAllCaps -eq 'true') {
                $joinedTitle = $Titletext.ToUpper()
            }
            Else {
                $joinedTitle = $Titletext
            }
        }
        Move-Item -LiteralPath $PicturePath -destination $backgroundImage -Force -ErrorAction SilentlyContinue
        Write-log -Subtext "Processing Poster for: `"$joinedTitle`"" -Path $global:ScriptRoot\Logs\Manuallog.log -Type Info

        # Resize Image to 2000x3000 and apply Border and overlay
        if ($AddBorder -eq 'true' -and $AddOverlay -eq 'true') {
            $Arguments = "`"$backgroundImage`" -resize 2000x3000^ -gravity center -extent 2000x3000 `"$overlay`" -gravity south -composite -shave `"$borderwidthsecond`"  -bordercolor `"$bordercolor`" -border `"$borderwidth`" `"$backgroundImage`""
            Write-log -Subtext "Resizing it | Adding Borders | Adding Overlay" -Path $global:ScriptRoot\Logs\Manuallog.log -Type Info
        }
        if ($AddBorder -eq 'true' -and $AddOverlay -eq 'false') {
            $Arguments = "`"$backgroundImage`" -resize 2000x3000^ -gravity center -extent 2000x3000 -shave `"$borderwidthsecond`"  -bordercolor `"$bordercolor`" -border `"$borderwidth`" `"$backgroundImage`""
            Write-log -Subtext "Resizing it | Adding Borders" -Path $global:ScriptRoot\Logs\Manuallog.log -Type Info
        }
        if ($AddBorder -eq 'false' -and $AddOverlay -eq 'true') {
            $Arguments = "`"$backgroundImage`" -resize 2000x3000^ -gravity center -extent 2000x3000 `"$overlay`" -gravity south -composite `"$backgroundImage`""
            Write-log -Subtext "Resizing it | Adding Overlay" -Path $global:ScriptRoot\Logs\Manuallog.log -Type Info
        }
        if ($AddBorder -eq 'false' -and $AddOverlay -eq 'false') {
            $Arguments = "`"$backgroundImage`" -resize 2000x3000^ -gravity center -extent 2000x3000 `"$backgroundImage`""
            Write-log -Subtext "Resizing it" -Path $global:ScriptRoot\Logs\Manuallog.log -Type Info
        }

        $logEntry = "magick.exe $Arguments"
        $logEntry | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append 
        Start-Process $magick -Wait -NoNewWindow -ArgumentList $Arguments

        if ($AddText -eq 'true') {
            $optimalFontSize = Get-OptimalPointSize -text $joinedTitle -font $fontImagemagick -box_width $MaxWidth  -box_height $MaxHeight -min_pointsize $minPointSize -max_pointsize $maxPointSize
            Write-log -Subtext "Optimal font size set to: '$optimalFontSize'" -Path $global:ScriptRoot\Logs\Manuallog.log -Type Info
            $Arguments = "`"$backgroundImage`" -gravity center -background None -layers Flatten `( -font `"$fontImagemagick`" -pointsize `"$optimalFontSize`" -fill `"$fontcolor`" -size `"$boxsize`" -background none caption:`"$joinedTitle`" -trim -gravity south -extent `"$boxsize`" `) -gravity south -geometry +0`"$text_offset`" -composite `"$backgroundImage`""
            Write-log -Subtext "    Applying Font text: `"$joinedTitle`"" -Path $global:ScriptRoot\Logs\Manuallog.log -Type Info
            $logEntry = "magick.exe $Arguments"
            $logEntry | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append 
            Start-Process $magick -Wait -NoNewWindow -ArgumentList $Arguments
        }
    }
    Else {
        # Resize Image to 2000x3000
        $Resizeargument = "`"$backgroundImage`" -resize 2000x3000^ -gravity center -extent 2000x3000 `"$backgroundImage`""
        Write-log -Subtext "Resizing it... " -Path $global:ScriptRoot\Logs\Manuallog.log -Type Info
        $logEntry = "magick.exe $Resizeargument"
        $logEntry | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append 
        Start-Process $magick -Wait -NoNewWindow -ArgumentList $Resizeargument
    }
    # Move file back to original naming with Brackets.
    Move-Item -LiteralPath $backgroundImage -destination $backgroundImageoriginal -Force -ErrorAction SilentlyContinue
    Write-log -Subtext "Poster created and moved to: $backgroundImageoriginal" -Path $global:ScriptRoot\Logs\Manuallog.log -Type Success
}
Elseif ($Testing){
    if (!(Test-Path $testimage)) {
        Invoke-WebRequest -uri "https://github.com/fscorrupt/Plex-Poster-Maker/raw/main/testimage.png" -OutFile $global:ScriptRoot\temp\testimage.png 
    }

    Write-log -Message "Poster Testing Started" -Path $global:ScriptRoot\Logs\Testinglog.log -Type Debug
    Write-log -Subtext "I will now create a few posters for you with different text lengths using your current configuration settings." -Path $global:ScriptRoot\Logs\Manuallog.log -Type Warning
    $ShortText = "The Hobbit" 
    $MiddleText = "The Hobbit is a great movie" 
    $LongText = "The Hobbit is a great movie that we all loved and enjoyed watching" 
    $ShortTextBold = $ShortText.ToUpper()
    $MiddleTextBold = $MiddleText.ToUpper()
    $LongTextBold = $LongText.ToUpper()
    $TestPosterShort = "$global:ScriptRoot\temp\ShortText.jpg"
    $TestPosterMiddle = "$global:ScriptRoot\temp\MiddleText.jpg"
    $TestPosterLong = "$global:ScriptRoot\temp\LongText.jpg"
    $TestPosterShortBold = "$global:ScriptRoot\temp\ShortTextBold.jpg"
    $TestPosterMiddleBold = "$global:ScriptRoot\temp\MiddleTextBold.jpg"
    $TestPosterLongBold = "$global:ScriptRoot\temp\LongTextBold.jpg"

    Copy-Item -LiteralPath $testimage $TestPosterShort
    Copy-Item -LiteralPath $testimage $TestPosterMiddle
    Copy-Item -LiteralPath $testimage $TestPosterLong
    Copy-Item -LiteralPath $testimage $TestPosterShortBold
    Copy-Item -LiteralPath $testimage $TestPosterMiddleBold
    Copy-Item -LiteralPath $testimage $TestPosterLongBold
    Remove-Item -LiteralPath $testimage | out-null

    $optimalFontSizeShort = Get-OptimalPointSize -text $ShortText -font $fontImagemagick -box_width $MaxWidth  -box_height $MaxHeight -min_pointsize $minPointSize -max_pointsize $maxPointSize
    $optimalFontSizeMiddle = Get-OptimalPointSize -text $MiddleText -font $fontImagemagick -box_width $MaxWidth  -box_height $MaxHeight -min_pointsize $minPointSize -max_pointsize $maxPointSize
    $optimalFontSizeLong = Get-OptimalPointSize -text $LongText -font $fontImagemagick -box_width $MaxWidth  -box_height $MaxHeight -min_pointsize $minPointSize -max_pointsize $maxPointSize
    
    $optimalFontSizeShortBold = Get-OptimalPointSize -text $ShortTextBold -font $fontImagemagick -box_width $MaxWidth  -box_height $MaxHeight -min_pointsize $minPointSize -max_pointsize $maxPointSize
    $optimalFontSizeMiddleBold = Get-OptimalPointSize -text $MiddleTextBold -font $fontImagemagick -box_width $MaxWidth  -box_height $MaxHeight -min_pointsize $minPointSize -max_pointsize $maxPointSize
    $optimalFontSizeLongBold = Get-OptimalPointSize -text $LongTextBold -font $fontImagemagick -box_width $MaxWidth  -box_height $MaxHeight -min_pointsize $minPointSize -max_pointsize $maxPointSize

    Write-log -Subtext "Optimal font size for Short text is: '$optimalFontSizeShort'" -Path $global:ScriptRoot\Logs\Testinglog.log -Type Info
    Write-log -Subtext "    Applying Font text: `"$ShortText`"" -Path $global:ScriptRoot\Logs\Testinglog.log -Type Info
    Write-log -Subtext "Optimal font size for Middle text is: '$optimalFontSizeMiddle'" -Path $global:ScriptRoot\Logs\Testinglog.log -Type Info
    Write-log -Subtext "    Applying Font text: `"$MiddleText`"" -Path $global:ScriptRoot\Logs\Testinglog.log -Type Info
    Write-log -Subtext "Optimal font size for Long text is: '$optimalFontSizeLong'" -Path $global:ScriptRoot\Logs\Testinglog.log -Type Info
    Write-log -Subtext "    Applying Font text: `"$LongText`"" -Path $global:ScriptRoot\Logs\Testinglog.log -Type Info

    Write-log -Subtext "Optimal font size for Short Bold text is: '$optimalFontSizeShortBold'" -Path $global:ScriptRoot\Logs\Testinglog.log -Type Info
    Write-log -Subtext "    Applying Bold Font text: `"$ShortTextBold`"" -Path $global:ScriptRoot\Logs\Testinglog.log -Type Info
    Write-log -Subtext "Optimal font size for Middle Bold text is: '$optimalFontSizeMiddleBold'" -Path $global:ScriptRoot\Logs\Testinglog.log -Type Info
    Write-log -Subtext "    Applying Bold Font text: `"$MiddleTextBold`"" -Path $global:ScriptRoot\Logs\Testinglog.log -Type Info
    Write-log -Subtext "Optimal font size for Long Bold text is: '$optimalFontSizeLongBold'" -Path $global:ScriptRoot\Logs\Testinglog.log -Type Info
    Write-log -Subtext "    Applying Bold Font text: `"$LongTextBold`"" -Path $global:ScriptRoot\Logs\Testinglog.log -Type Info

    $ArgumentsShort = "`"$TestPosterShort`" -gravity center -background none -layers Flatten ( -font `"$fontImagemagick`" -pointsize `"$optimalFontSizeShort`" -fill `"#0000FF`" -size `"$boxsize`" -background `"#ACD7E6`" caption:`"$ShortText`" -trim -gravity south -extent `"$boxsize`" ) -gravity south -geometry +0+`"$text_offset`" -composite `"$TestPosterShort`""
    $ArgumentsMiddle = "`"$TestPosterMiddle`" -gravity center -background none -layers Flatten ( -font `"$fontImagemagick`" -pointsize `"$optimalFontSizeMiddle`" -fill `"#0000FF`" -size `"$boxsize`" -background `"#ACD7E6`" caption:`"$MiddleText`" -trim -gravity south -extent `"$boxsize`" ) -gravity south -geometry +0+`"$text_offset`" -composite `"$TestPosterMiddle`""
    $ArgumentsLong = "`"$TestPosterLong`" -gravity center -background none -layers Flatten ( -font `"$fontImagemagick`" -pointsize `"$optimalFontSizeLong`" -fill `"#0000FF`" -size `"$boxsize`" -background `"#ACD7E6`" caption:`"$LongText`" -trim -gravity south -extent `"$boxsize`" ) -gravity south -geometry +0+`"$text_offset`" -composite `"$TestPosterLong`""
    $ArgumentsShortBold = "`"$TestPosterShortBold`" -gravity center -background none -layers Flatten ( -font `"$fontImagemagick`" -pointsize `"$optimalFontSizeShortBold`" -fill `"#0000FF`" -size `"$boxsize`" -background `"#ACD7E6`" caption:`"$ShortTextBold`" -trim -gravity south -extent `"$boxsize`" ) -gravity south -geometry +0+`"$text_offset`" -composite `"$TestPosterShortBold`""
    $ArgumentsMiddleBold = "`"$TestPosterMiddleBold`" -gravity center -background none -layers Flatten ( -font `"$fontImagemagick`" -pointsize `"$optimalFontSizeMiddleBold`" -fill `"#0000FF`" -size `"$boxsize`" -background `"#ACD7E6`" caption:`"$MiddleTextBold`" -trim -gravity south -extent `"$boxsize`" ) -gravity south -geometry +0+`"$text_offset`" -composite `"$TestPosterMiddleBold`""
    $ArgumentsLongBold = "`"$TestPosterLongBold`" -gravity center -background none -layers Flatten ( -font `"$fontImagemagick`" -pointsize `"$optimalFontSizeLongBold`" -fill `"#0000FF`" -size `"$boxsize`" -background `"#ACD7E6`" caption:`"$LongTextBold`" -trim -gravity south -extent `"$boxsize`" ) -gravity south -geometry +0+`"$text_offset`" -composite `"$TestPosterLongBold`""
    
    $logEntryShort = "magick.exe $ArgumentsShort"
    $logEntryMiddle = "magick.exe $ArgumentsMiddle"
    $logEntryLong = "magick.exe $ArgumentsLong"
    $logEntryShortBold = "magick.exe $ArgumentsShortBold"
    $logEntryMiddleBold = "magick.exe $ArgumentsMiddleBold"
    $logEntryLongBold = "magick.exe $ArgumentsLongBold"

    $logEntryShort | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append 
    $logEntryShortBold | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append 
    $logEntryMiddle | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append 
    $logEntryMiddleBold | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append 
    $logEntryLong | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append 
    $logEntryLongBold | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append 

    Start-Process $magick -Wait -NoNewWindow -ArgumentList $ArgumentsShort
    Start-Process $magick -Wait -NoNewWindow -ArgumentList $ArgumentsMiddle
    Start-Process $magick -Wait -NoNewWindow -ArgumentList $ArgumentsLong
    Start-Process $magick -Wait -NoNewWindow -ArgumentList $ArgumentsShortBold
    Start-Process $magick -Wait -NoNewWindow -ArgumentList $ArgumentsMiddleBold
    Start-Process $magick -Wait -NoNewWindow -ArgumentList $ArgumentsLongBold
    Write-log -Subtext "Poster Tests finished, you can find them here: $global:ScriptRoot\temp" -Path $global:ScriptRoot\Logs\Testinglog.log -Type Success
}
else {
    Write-log -Message "Query plex libs..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
    $Libsoverview = @()
    foreach ($lib in $libs.MediaContainer.Directory) {
        if ($lib.title -notin $LibstoExclude) {
            $libtemp = New-Object psobject
            $libtemp | Add-Member -MemberType NoteProperty -Name "ID" -Value $lib.key
            $libtemp | Add-Member -MemberType NoteProperty -Name "Name" -Value $lib.title
            
            # Check if $lib.location.path is an array
            if ($lib.location.path -is [array]) {
                $paths = $lib.location.path -join ',' # Convert array to string
                $libtemp | Add-Member -MemberType NoteProperty -Name "Path" -Value $paths
            }
            else {
                $libtemp | Add-Member -MemberType NoteProperty -Name "Path" -Value $lib.location.path
            }
            
            $Libsoverview += $libtemp
        }
    }
    Write-log -Subtext "Found '$($Libsoverview.count)' libs and '$($LibstoExclude.count)' are excluded..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Trace

    Write-log -Message "Query all items from all Libs, this can take a while..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
    #$Libraries = Import-Csv "C:\posterTemp\logs\PlexLibexport.csv" -Delimiter ';' 
    #<#
    $Libraries = @()
    Foreach ($Library in $Libsoverview) {
        if ($Library.Name -notin $LibstoExclude) {
            if ($PlexToken) {
                [xml]$Libcontent = (Invoke-WebRequest $PlexUrl/library/sections/$($Library.ID)/all?X-Plex-Token=$PlexToken).content
            }
            Else {
                [xml]$Libcontent = (Invoke-WebRequest $PlexUrl/library/sections/$($Library.ID)/all).content
            }
            if ($Libcontent.MediaContainer.video) {
                $contentquery = 'video'
            }
            Else {
                $contentquery = 'Directory'
            }
            foreach ($item in $Libcontent.MediaContainer.$contentquery) {
                $Seasondata = $null
                if ($PlexToken) {
                    if ($contentquery -eq 'Directory') {
                        [xml]$Metadata = (Invoke-WebRequest $PlexUrl/library/metadata/$($item.ratingKey)?X-Plex-Token=$PlexToken).content
                        [xml]$Seasondata = (Invoke-WebRequest $PlexUrl/library/metadata/$($item.ratingKey)/children?X-Plex-Token=$PlexToken).content
                    }
                    [xml]$Metadata = (Invoke-WebRequest $PlexUrl/library/metadata/$($item.ratingKey)?X-Plex-Token=$PlexToken).content
                }
                Else {
                    if ($contentquery -eq 'Directory') {
                        [xml]$Metadata = (Invoke-WebRequest $PlexUrl/library/metadata/$($item.ratingKey)).content
                        [xml]$Seasondata = (Invoke-WebRequest $PlexUrl/library/metadata/$($item.ratingKey)/children?).content
                    }
                    [xml]$Metadata = (Invoke-WebRequest $PlexUrl/library/metadata/$($item.ratingKey)).content
                }
                $metadatatemp = $Metadata.MediaContainer.$contentquery.guid.id
                $tmdbpattern = 'tmdb://(\d+)'
                $imdbpattern = 'imdb://tt(\d+)'
                $tvdbpattern = 'tvdb://(\d+)'
                if ($Metadata.MediaContainer.$contentquery.Location) {
                    $location = $Metadata.MediaContainer.$contentquery.Location.path
                    if ($location.count -gt '1') {
                        $location = $location[0]
                        $MultipleVersions = $true
                    }
                    Else {
                        $MultipleVersions = $false
                    }
                    $libpaths = $($Library.path).split(',')
                    foreach ($libpath in $libpaths) {
                        if ($location -like "$libpath*") {
                            $Matchedpath = AddTrailingSlash $libpath
                            $libpath = $Matchedpath
                            $extractedFolder = $location.Substring($libpath.Length)
                        }
                    }
                }
                Else {
                    $location = $Metadata.MediaContainer.$contentquery.media.part.file
                    if ($location.count -gt '1') {
                        $location = $location[0]
                        $MultipleVersions = $true
                    }
                    Else {
                        $MultipleVersions = $false
                    }
                    $libpaths = $($Library.path).split(',')
                    foreach ($libpath in $libpaths) {
                        if ($location -like "$libpath*") {
                            $Matchedpath = AddTrailingSlash $libpath
                            $libpath = $Matchedpath
                            $extractedFolder = $location.Substring($libpath.Length)
                            if ($extractedFolder -like '*\*') {
                                $extractedFolder = $extractedFolder.split('\')[0]
                            }
                            if ($extractedFolder -like '*/*') {
                                $extractedFolder = $extractedFolder.split('/')[0]
                            }
                        }
                    }
                }
                if ($Seasondata) {
                    $SeasonsTemp = $Seasondata.MediaContainer.Directory | Where-Object { $_.Title -ne 'All episodes' }
                    $SeasonNames = $SeasonsTemp.Title -join ','
                    $SeasonNumbers = $SeasonsTemp.index -join ','
                }

                $matchesimdb = [regex]::Matches($metadatatemp, $imdbpattern)
                $matchestmdb = [regex]::Matches($metadatatemp, $tmdbpattern)
                $matchestvdb = [regex]::Matches($metadatatemp, $tvdbpattern)
                if ($matchesimdb.value) { $imdbid = $matchesimdb.value.Replace('imdb://', '') }Else { $imdbid = $null }
                if ($matchestmdb.value) { $tmdbid = $matchestmdb.value.Replace('tmdb://', '') }Else { $tmdbid = $null }
                if ($matchestvdb.value) { $tvdbid = $matchestvdb.value.Replace('tvdb://', '') }Else { $tvdbid = $null }

                # check if there are more then 1 entry in id´s
                if ($tvdbid.count -gt '1') { $tvdbid = $tvdbid[0] }
                if ($tmdbid.count -gt '1') { $tmdbid = $tmdbid[0] }
                if ($imdbid.count -gt '1') { $imdbid = $imdbid[0] }

                $temp = New-Object psobject
                $temp | Add-Member -MemberType NoteProperty -Name "Library Name" -Value $Library.Name
                $temp | Add-Member -MemberType NoteProperty -Name "Library Type" -Value $Metadata.MediaContainer.$contentquery.type
                $temp | Add-Member -MemberType NoteProperty -Name "title" -Value $($item.title)
                $temp | Add-Member -MemberType NoteProperty -Name "originalTitle" -Value $($item.originalTitle)
                $temp | Add-Member -MemberType NoteProperty -Name "SeasonNames" -Value $SeasonNames
                $temp | Add-Member -MemberType NoteProperty -Name "SeasonNumbers" -Value $SeasonNumbers
                $temp | Add-Member -MemberType NoteProperty -Name "year" -Value $item.year
                $temp | Add-Member -MemberType NoteProperty -Name "tvdbid" -Value $tvdbid
                $temp | Add-Member -MemberType NoteProperty -Name "imdbid" -Value $imdbid
                $temp | Add-Member -MemberType NoteProperty -Name "tmdbid" -Value $tmdbid
                $temp | Add-Member -MemberType NoteProperty -Name "ratingKey" -Value $item.ratingKey
                $temp | Add-Member -MemberType NoteProperty -Name "Path" -Value $Matchedpath
                $temp | Add-Member -MemberType NoteProperty -Name "RootFoldername" -Value $extractedFolder
                $temp | Add-Member -MemberType NoteProperty -Name "MultipleVersions" -Value $MultipleVersions
                $Libraries += $temp
            }
        }
    }
    Write-log -Subtext "Found '$($Libraries.count)' Items..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Trace
    $Libraries | Select-Object * | Export-Csv -Path "$global:ScriptRoot\Logs\PlexLibexport.csv" -NoTypeInformation -Delimiter ';' -Encoding UTF8 -Force
    Write-log -Message "Export everything to a csv: $global:ScriptRoot\Logs\PlexLibexport.csv" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
    #>
    # Download poster foreach movie
    Write-log -Message "Starting poster creation now, this can take a while..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
    # Initialize counter variable
    $posterCount = 0
    $SeasonCount = 0
    $PosterUnknownCount = 0
    $AllShows = $Libraries | Where-Object { $_.'Library Type' -eq 'show' }
    $AllMovies = $Libraries | Where-Object { $_.'Library Type' -eq 'movie' }
    Write-log -Message "Starting Movie Poster Creation part..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Success
    # Movie Part
    foreach ($entry in $AllMovies) {
        try {
            if ($($entry.RootFoldername)) {
                $global:posterurl = $null
                $global:TextlessPoster = $null
                $global:TMDBfallbackposterurl = $null
                $global:fanartfallbackposterurl = $null
                $global:IsFallback = $null
                $global:IsTruncated = $null
    
                $cjkPattern = '[\p{IsHiragana}\p{IsKatakana}\p{IsCJKUnifiedIdeographs}\p{IsCyrillic}]'
                if ($entry.title -match $cjkPattern) {
                    $Titletext = $entry.originalTitle
                }
                else {
                    $Titletext = $entry.title
                }
    
                if ($LibraryFolders -eq 'true') {
                    $LibraryName = $entry.'Library Name'
                    $EntryDir = "$AssetPath\$LibraryName\$($entry.RootFoldername)"
                    $backgroundImageoriginal = "$EntryDir\poster.jpg"
                    
                    if (!(Get-ChildItem -LiteralPath $EntryDir -ErrorAction SilentlyContinue)) {
                        New-Item -ItemType Directory -path $EntryDir -Force | out-null
                    }
                }
                Else {
                    $backgroundImageoriginal = "$AssetPath\$($entry.RootFoldername).jpg"
                }
    
                $backgroundImage = "$global:ScriptRoot\temp\$($entry.RootFoldername).jpg"
                $backgroundImage = $backgroundImage.Replace('[', '_').Replace(']', '_').Replace('{', '_').Replace('}', '_')
    
                if (!(Get-ChildItem -LiteralPath $backgroundImageoriginal -ErrorAction SilentlyContinue)) {
                    # Define Global Variables
                    $global:tmdbid = $entry.tmdbid
                    $global:tvdbid = $entry.tvdbid
                    $global:imdbid = $entry.imdbid
                    $global:posterurl = $null
                    $global:PosterWithText = $null
    
                    Write-log -Message "Start Poster Search for: $Titletext" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                    switch -Wildcard ($global:FavProvider) {
                        'TMDB' { if ($entry.tmdbid) { $global:posterurl = GetTMDBMoviePoster }Else { Write-Log -Subtext "Can't search on TMDB, missing ID..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Warning; $global:posterurl = GetFanartMoviePoster } }
                        'FANART' { $global:posterurl = GetFanartMoviePoster }
                        'TVDB' { if ($entry.tvdbid) { $global:posterurl = GetTVDBMoviePoster }Else { Write-Log -Subtext "Can't search on TMDB, missing ID..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Warning; $global:posterurl = GetFanartMoviePoster } }
                        Default { $global:posterurl = GetFanartMoviePoster }
                    }
                    switch -Wildcard ($global:Fallback) {
                        'TMDB' { if ($entry.tmdbid) { $global:posterurl = GetTMDBMoviePoster } }
                        'FANART' { $global:posterurl = GetFanartMoviePoster }
                    }
                    if ($global:PreferTextless -eq 'True') {
                        if (!$global:TextlessPoster -and $global:fanartfallbackposterurl) {
                            $global:posterurl = $global:fanartfallbackposterurl
                            Write-log -Subtext "Took Fanart.tv Fallback poster cause its your Fav Provider" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Trace
                            $global:IsFallback = $true
                        }
                        if (!$global:TextlessPoster -and $global:TMDBfallbackposterurl) {
                            $global:posterurl = $global:TMDBfallbackposterurl
                            Write-log -Subtext "Took TMDB Fallback poster cause its your Fav Provider" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Trace
                            $global:IsFallback = $true
                        }
                    }
                    if ($global:TextlessPoster -eq 'true' -and $global:posterurl) {
                    } 
                    if (!$global:posterurl) {
                        $global:posterurl = GetTVDBMoviePoster
                        $global:IsFallback = $true
                        if (!$global:posterurl -and $global:imdbid) { 
                            Write-log -Subtext "Searching on IMDB for a movie poster" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Trace
                            $global:posterurl = GetIMDBPoster
                            $global:IsFallback = $true
                            if (!$global:posterurl) { 
                                Write-log -Subtext "Could not find a poster on any site" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Error
                                $Errorcount++
                            }
                        }
                    }
    
                    if ($fontAllCaps -eq 'true') {
                        $joinedTitle = $Titletext.ToUpper()
                    }
                    Else {
                        $joinedTitle = $Titletext
                    }
                    if ($global:posterurl) {
                        Invoke-WebRequest -Uri $global:posterurl -OutFile $backgroundImage
                        Write-Log -Subtext "Poster url: $global:posterurl" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                        if ($global:posterurl -like 'https://image.tmdb.org*') {
                            if ($global:PosterWithText) {
                                Write-Log -Subtext "Downloading Poster with Text from 'TMDB'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type debug
                            }
                            Else {
                                Write-Log -Subtext "Downloading Textless Poster from 'TMDB'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type debug
                            }
                        }
                        elseif ($global:posterurl -like 'https://assets.fanart.tv*') {
                            if ($global:PosterWithText) {
                                Write-Log -Subtext "Downloading Poster with Text from 'FANART'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type debug
                            }
                            Else {
                                Write-Log -Subtext "Downloading Textless Poster from 'FANART'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type debug
                            }
                        }
                        elseif ($global:posterurl -like 'https://artworks.thetvdb.com*') {
                            Write-Log -Subtext "Downloading Poster from 'TVDB'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type debug
                        }
                        Else {
                            Write-Log -Subtext "Downloading Poster from 'IMDB'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type debug
                        }
                        if ($global:ImageProcessing -eq 'true') {
                            Write-log -Subtext "Processing Poster for: `"$joinedTitle`"" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
        
                            # Calculate the height to maintain the aspect ratio with a width of 1000 pixels
                            if ($AddBorder -eq 'true' -and $AddOverlay -eq 'true') {
                                $Arguments = "`"$backgroundImage`" -resize 2000x3000^ -gravity center -extent 2000x3000 `"$overlay`" -gravity south -composite -shave `"$borderwidthsecond`"  -bordercolor `"$bordercolor`" -border `"$borderwidth`" `"$backgroundImage`""
                                Write-log -Subtext "Resizing it | Adding Borders | Adding Overlay" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                            }
                            if ($AddBorder -eq 'true' -and $AddOverlay -eq 'false') {
                                $Arguments = "`"$backgroundImage`" -resize 2000x3000^ -gravity center -extent 2000x3000 -shave `"$borderwidthsecond`"  -bordercolor `"$bordercolor`" -border `"$borderwidth`" `"$backgroundImage`""
                                Write-log -Subtext "Resizing it | Adding Borders" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                            }
                            if ($AddBorder -eq 'false' -and $AddOverlay -eq 'true') {
                                $Arguments = "`"$backgroundImage`" -resize 2000x3000^ -gravity center -extent 2000x3000 `"$overlay`" -gravity south -composite `"$backgroundImage`""
                                Write-log -Subtext "Resizing it | Adding Overlay" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                            }
                            if ($AddBorder -eq 'false' -and $AddOverlay -eq 'false') {
                                $Arguments = "`"$backgroundImage`" -resize 2000x3000^ -gravity center -extent 2000x3000 `"$backgroundImage`""
                                Write-log -Subtext "Resizing it" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                            }
                            $logEntry = "magick.exe $Arguments"
                            $logEntry | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append 
                            Start-Process $magick -Wait -NoNewWindow -ArgumentList $Arguments
        
                            if ($AddText -eq 'true') {
                                $optimalFontSize = Get-OptimalPointSize -text $joinedTitle -font $fontImagemagick -box_width $MaxWidth  -box_height $MaxHeight -min_pointsize $minPointSize -max_pointsize $maxPointSize
                                Write-log -Subtext "Optimal font size set to: '$optimalFontSize'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                                $Arguments = "`"$backgroundImage`" -gravity center -background None -layers Flatten `( -font `"$fontImagemagick`" -pointsize `"$optimalFontSize`" -fill `"$fontcolor`" -size `"$boxsize`" -background none caption:`"$joinedTitle`" -trim -gravity south -extent `"$boxsize`" `) -gravity south -geometry +0`"$text_offset`" -composite `"$backgroundImage`""
                                Write-log -Subtext "Applying Font text: `"$joinedTitle`"" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                                $logEntry = "magick.exe $Arguments"
                                $logEntry | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append 
                                Start-Process $magick -Wait -NoNewWindow -ArgumentList $Arguments
                            }
                        }
                        Else {
                            $Resizeargument = "`"$backgroundImage`" -resize 2000x3000^ -gravity center -extent 2000x3000 `"$backgroundImage`""
                            Write-log -Subtext "Resizing it... " -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                            $logEntry = "magick.exe $Resizeargument"
                            $logEntry | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append 
                            Start-Process $magick -Wait -NoNewWindow -ArgumentList $Resizeargument
                        }
                        # Move file back to original naming with Brackets.
                        Move-Item -LiteralPath $backgroundImage $backgroundImageoriginal -Force -ErrorAction SilentlyContinue
                        Write-log -Subtext "--------------------------------------------------------------------------------" -Path $global:ScriptRoot\Logs\Scriptlog.log  -Type Info

                        $movietemp = New-Object psobject
                        $movietemp | Add-Member -MemberType NoteProperty -Name "Title" -Value $Titletext
                        $movietemp | Add-Member -MemberType NoteProperty -Name "Type" -Value 'Movie'
                        $movietemp | Add-Member -MemberType NoteProperty -Name "Rootfolder" -Value $($entry.RootFoldername)
                        $movietemp | Add-Member -MemberType NoteProperty -Name "LibraryName" -Value $($entry.'Library Name')
                        $movietemp | Add-Member -MemberType NoteProperty -Name "Textless" -Value $(if ($global:TextlessPoster) { 'True' } else { 'False' })
                        $movietemp | Add-Member -MemberType NoteProperty -Name "Fallback" -Value $(if ($global:IsFallback) { 'True' } else { 'False' })
                        $movietemp | Add-Member -MemberType NoteProperty -Name "TextTruncated" -Value $(if ($global:IsTruncated) { 'True' } else { 'False' })
                        $movietemp | Add-Member -MemberType NoteProperty -Name "Url" -Value $global:posterurl
        
                        # Export the array to a CSV file
                        $movietemp | Export-Csv -Path "$global:ScriptRoot\Logs\PosterChoices.csv" -NoTypeInformation -Delimiter ';' -Encoding UTF8 -Force -Append
                        $posterCount++
                    }
                    Else {
                        Write-log -Subtext "Missing poster URL for: $($entry.title)" -Path $global:ScriptRoot\Logs\Scriptlog.log  -Type Error
                        $Errorcount++
                    }
                }
            }
            
            Else {
                Write-log -Message "Missing RootFolder for: $($entry.title) - you have to manually create the poster for it..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Error
                $Errorcount++
            }
        }
        catch {
            <#Do this if a terminating exception happens#>
        }
    }

    Write-log -Message "Starting Show/Season Poster Creation part..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Success
    # Show Part
    foreach ($entry in $AllShows) {
        if ($($entry.RootFoldername)) {
            # Define Global Variables
            $global:tmdbid = $entry.tmdbid
            $global:tvdbid = $entry.tvdbid
            $global:imdbid = $entry.imdbid
            $Seasonpostersearchtext = $null
            $global:TMDBfallbackposterurl = $null
            $global:fanartfallbackposterurl = $null
            $FanartSearched = $null
            $global:posterurl = $null
            $global:PosterWithText = $null
            $global:IsFallback = $null
            $global:IsTruncated = $null
            $global:TextlessPoster = $null
    
            $cjkPattern = '[\p{IsHiragana}\p{IsKatakana}\p{IsCJKUnifiedIdeographs}\p{IsCyrillic}]'
            if ($entry.title -match $cjkPattern) {
                $Titletext = $entry.originalTitle
            }
            else {
                $Titletext = $entry.title
            }
    
            if ($LibraryFolders -eq 'true') {
                $LibraryName = $entry.'Library Name'
                $EntryDir = "$AssetPath\$LibraryName\$($entry.RootFoldername)"
                $backgroundImageoriginal = "$EntryDir\poster.jpg"
                        
                if (!(Get-ChildItem -LiteralPath $EntryDir -ErrorAction SilentlyContinue)) {
                    New-Item -ItemType Directory -path $EntryDir -Force | out-null
                }
            }
            Else {
                $backgroundImageoriginal = "$AssetPath\$($entry.RootFoldername).jpg"
            }
    
            $backgroundImage = "$global:ScriptRoot\temp\$($entry.RootFoldername).jpg"
            $backgroundImage = $backgroundImage.Replace('[', '_').Replace(']', '_').Replace('{', '_').Replace('}', '_')
            
            if (!(Get-ChildItem -LiteralPath $backgroundImageoriginal -ErrorAction SilentlyContinue)) {
                Write-log -Message "Start Poster Search for: $Titletext" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                switch -Wildcard ($global:FavProvider) {
                    'TMDB' { if ($entry.tmdbid) { $global:posterurl = GetTMDBShowPoster }Else { Write-Log -Subtext "Can't search on TMDB, missing ID..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Warning; $global:posterurl = GetFanartShowPoster } }
                    'FANART' { $global:posterurl = GetFanartShowPoster }
                    'TVDB' { if ($entry.tvdbid) { $global:posterurl = GetTVDBShowPoster }Else { Write-Log -Subtext "Can't search on TMDB, missing ID..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Warning; $global:posterurl = GetFanartShowPoster } }
                    Default { $global:posterurl = GetFanartShowPoster }
                }
                switch -Wildcard ($global:Fallback) {
                    'TMDB' { if ($entry.tmdbid) { $global:posterurl = GetTMDBShowPoster } }
                    'FANART' { $global:posterurl = GetFanartShowPoster }
                }
                if ($global:PreferTextless -eq 'True') {
                    if (!$global:TextlessPoster -and $global:fanartfallbackposterurl) {
                        $global:posterurl = $global:fanartfallbackposterurl
                        Write-log -Subtext "Took Fanart.tv Fallback poster cause its your Fav Provider" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Trace
                        $global:IsFallback = $true
                    }
                    if (!$global:TextlessPoster -and $global:TMDBfallbackposterurl) {
                        $global:posterurl = $global:TMDBfallbackposterurl
                        Write-log -Subtext "Took TMDB Fallback poster cause its your Fav Provider" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Trace
                        $global:IsFallback = $true
                    }
                    # try to find textless on TVDB
                    if ($global:TextlessPoster -ne 'true' -and $entry.tvdbid ) {
                        $global:posterurl = GetTVDBShowPoster
                        $global:IsFallback = $true
                    }
                }

                if (!$global:TextlessPoster -eq 'true' -and $global:posterurl) {
                    $global:PosterWithText = $true
                } 

                if (!$global:posterurl) {
                    $global:posterurl = GetTVDBShowPoster
                    $global:IsFallback = $true
                    if (!$global:posterurl) {
                        Write-log -Subtext "Could not find a poster on any site" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Error
                        $Errorcount++
                    }
                }
                if ($fontAllCaps -eq 'true') {
                    $joinedTitle = $Titletext.ToUpper()
                }
                Else {
                    $joinedTitle = $Titletext
                }
                if (!$global:TextlessPoster -eq 'True' -and $global:TMDBfallbackposterurl) {
                    $global:posterurl = $global:TMDBfallbackposterurl
                }
                if (!$global:TextlessPoster -eq 'True' -and $global:fanartfallbackposterurl) {
                    $global:posterurl = $global:fanartfallbackposterurl
                }
                if ($global:posterurl) {
                    Invoke-WebRequest -Uri $global:posterurl -OutFile $backgroundImage
                    Write-Log -Subtext "Poster url: $global:posterurl" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                    if ($global:posterurl -like 'https://image.tmdb.org*') {
                        if ($global:PosterWithText) {
                            Write-Log -Subtext "Downloading Poster with Text from 'TMDB'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type debug
                        }
                        Else {
                            Write-Log -Subtext "Downloading Textless Poster from 'TMDB'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type debug
                        }
                    }
                    elseif ($global:posterurl -like 'https://assets.fanart.tv*') {
                        if ($global:PosterWithText) {
                            Write-Log -Subtext "Downloading Poster with Text from 'FANART'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type debug
                        }
                        Else {
                            Write-Log -Subtext "Downloading Textless Poster from 'FANART'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type debug
                        }
                    }
                    elseif ($global:posterurl -like 'https://artworks.thetvdb.com*') {
                        Write-Log -Subtext "Downloading Poster from 'TVDB'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type debug
                    }
                    Else {
                        Write-Log -Subtext "Downloading Poster from 'IMDB'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type debug
                        $global:IsFallback = $true
                    }
                    if ($global:ImageProcessing -eq 'true') {
                        Write-log -Subtext "Processing Poster for: `"$joinedTitle`"" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
    
                        # Calculate the height to maintain the aspect ratio with a width of 1000 pixels
                        if ($AddBorder -eq 'true' -and $AddOverlay -eq 'true') {
                            $Arguments = "`"$backgroundImage`" -resize 2000x3000^ -gravity center -extent 2000x3000 `"$overlay`" -gravity south -composite -shave `"$borderwidthsecond`"  -bordercolor `"$bordercolor`" -border `"$borderwidth`" `"$backgroundImage`""
                            Write-log -Subtext "Resizing it | Adding Borders | Adding Overlay" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                        }
                        if ($AddBorder -eq 'true' -and $AddOverlay -eq 'false') {
                            $Arguments = "`"$backgroundImage`" -resize 2000x3000^ -gravity center -extent 2000x3000 -shave `"$borderwidthsecond`"  -bordercolor `"$bordercolor`" -border `"$borderwidth`" `"$backgroundImage`""
                            Write-log -Subtext "Resizing it | Adding Borders" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                        }
                        if ($AddBorder -eq 'false' -and $AddOverlay -eq 'true') {
                            $Arguments = "`"$backgroundImage`" -resize 2000x3000^ -gravity center -extent 2000x3000 `"$overlay`" -gravity south -composite `"$backgroundImage`""
                            Write-log -Subtext "Resizing it | Adding Overlay" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                        }
                        if ($AddBorder -eq 'false' -and $AddOverlay -eq 'false') {
                            $Arguments = "`"$backgroundImage`" -resize 2000x3000^ -gravity center -extent 2000x3000 `"$backgroundImage`""
                            Write-log -Subtext "Resizing it" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                        }
                        $logEntry = "magick.exe $Arguments"
                        $logEntry | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append 
                        Start-Process $magick -Wait -NoNewWindow -ArgumentList $Arguments
    
                        if ($AddText -eq 'true') {
                            $optimalFontSize = Get-OptimalPointSize -text $joinedTitle -font $fontImagemagick -box_width $MaxWidth  -box_height $MaxHeight -min_pointsize $minPointSize -max_pointsize $maxPointSize
                            Write-log -Subtext "Optimal font size set to: '$optimalFontSize'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                            $Arguments = "`"$backgroundImage`" -gravity center -background None -layers Flatten `( -font `"$fontImagemagick`" -pointsize `"$optimalFontSize`" -fill `"$fontcolor`" -size `"$boxsize`" -background none caption:`"$joinedTitle`" -trim -gravity south -extent `"$boxsize`" `) -gravity south -geometry +0`"$text_offset`" -composite `"$backgroundImage`""
                            Write-log -Subtext "Applying Font text: `"$joinedTitle`"" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                            $logEntry = "magick.exe $Arguments"
                            $logEntry | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append 
                            Start-Process $magick -Wait -NoNewWindow -ArgumentList $Arguments
                        }
                    }
                    Else {
                        $Resizeargument = "`"$backgroundImage`" -resize 2000x3000^ -gravity center -extent 2000x3000 `"$backgroundImage`""
                        Write-log -Subtext "Resizing it... " -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                        $logEntry = "magick.exe $Resizeargument"
                        $logEntry | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append 
                        Start-Process $magick -Wait -NoNewWindow -ArgumentList $Resizeargument
                    }
                    if (Get-ChildItem -LiteralPath $backgroundImage -ErrorAction SilentlyContinue) {
                        # Move file back to original naming with Brackets.
                        Move-Item -LiteralPath $backgroundImage $backgroundImageoriginal -Force -ErrorAction SilentlyContinue
                        Write-log -Subtext "--------------------------------------------------------------------------------" -Path $global:ScriptRoot\Logs\Scriptlog.log  -Type Info
                        $posterCount++
                    }
                }
                Else {
                    Write-log -Subtext "Missing poster URL for: $($entry.title)" -Path $global:ScriptRoot\Logs\Scriptlog.log  -Type Error
                    $Errorcount++
                }

                $showtemp = New-Object psobject
                $showtemp | Add-Member -MemberType NoteProperty -Name "Title" -Value $Titletext
                $showtemp | Add-Member -MemberType NoteProperty -Name "Type" -Value 'Show'
                $showtemp | Add-Member -MemberType NoteProperty -Name "Rootfolder" -Value $($entry.RootFoldername)
                $showtemp | Add-Member -MemberType NoteProperty -Name "LibraryName" -Value $($entry.'Library Name')
                $showtemp | Add-Member -MemberType NoteProperty -Name "Textless" -Value $(if ($global:TextlessPoster) { 'True' } else { 'False' })
                $showtemp | Add-Member -MemberType NoteProperty -Name "Fallback" -Value $(if ($global:IsFallback) { 'True' } else { 'False' })
                $showtemp | Add-Member -MemberType NoteProperty -Name "TextTruncated" -Value $(if ($global:IsTruncated) { 'True' } else { 'False' })
                $showtemp | Add-Member -MemberType NoteProperty -Name "Url" -Value $global:posterurl

                # Export the array to a CSV file
                $showtemp | Export-Csv -Path "$global:ScriptRoot\Logs\PosterChoices.csv" -NoTypeInformation -Delimiter ';' -Encoding UTF8 -Force -Append

            }
            # Now we can start the Season Part
            if ($global:SeasonPosters -eq 'true') {
                $global:seasonNames = $entry.SeasonNames -split ','
                $global:seasonNumbers = $entry.seasonNumbers -split ','
                for ($i = 0; $i -lt $global:seasonNames.Count; $i++) {
                    if ($fontAllCaps -eq 'true') {
                        $global:seasonTitle = $global:seasonNames[$i].ToUpper()
                    }
                    Else {
                        $global:seasonTitle = $global:seasonNames[$i]
                    }
                    $global:SeasonNumber = $global:seasonNumbers[$i]
                    $global:season = "Season" + $global:SeasonNumber.PadLeft(2, '0')

                    if ($LibraryFolders -eq 'true') {
                        $SeasonImageoriginal = "$EntryDir\$global:season.jpg"
                    }
                    Else {
                        $SeasonImageoriginal = "$AssetPath\$($entry.RootFoldername)_$global:season.jpg"
                    }
                    $SeasonImage = "$global:ScriptRoot\temp\$($entry.RootFoldername)_$global:season.jpg"
                    $SeasonImage = $SeasonImage.Replace('[', '_').Replace(']', '_').Replace('{', '_').Replace('}', '_')
                    if (!(Get-ChildItem -LiteralPath $SeasonImageoriginal -ErrorAction SilentlyContinue)) {
                        if (!$Seasonpostersearchtext) {
                            Write-log -Message "Start Season Poster Search for: $Titletext" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                            $Seasonpostersearchtext = $true
                        }
                        if ($entry.tmdbid) {
                            if ($global:TextlessPoster) {
                                $global:TMDBfallbackposterurl = $global:posterurl
                                $global:TextlessFallbackPoster = $true
                                $global:TextlessPoster = $null
                            }
                            if ($global:PreferTextless -eq 'False') {
                                $global:TMDBfallbackposterurl = $global:posterurl
                                $global:TextFallbackPoster = $true
                                $global:TextlessPoster = $null
                            }
                            $global:posterurl = GetTMDBSeasonPoster
                        } 
                        Else {
                            Write-Log -Subtext "Can't search on TMDB, missing ID..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Warning
                            $FanartSearched = $true
                            $global:posterurl = GetFanartSeasonPoster
                        }
                        if (!$global:posterurl -and !$FanartSearched) {
                            $global:posterurl = GetFanartSeasonPoster 
                            if (!$global:posterurl -and $global:TMDBfallbackposterurl) {
                                $global:IsFallback = $true
                            }
                        }
                        if (!$global:posterurl) {
                            $global:posterurl = GetTVDBShowPoster
                            if ($global:TMDBfallbackposterurl) {
                                $global:IsFallback = $true
                            }
                        }
                        if (!$global:TextlessPoster) {
                            $global:PosterWithText = $true
                        }
                        if (($global:TextlessFallbackPoster -or $global:TextFallbackPoster) -and $global:PosterWithText) {
                            Write-Log -Subtext "Taking TMDB Fallback poster..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Type debug
                            $global:posterurl = $global:TMDBfallbackposterurl
                            if ($global:TextlessFallbackPoster){
                                $global:TextlessPoster = 'true'
                            }
                        }
                        if ($global:posterurl) {
                            if ($global:ImageProcessing -eq 'true') {
                                Invoke-WebRequest -Uri $global:posterurl -OutFile $SeasonImage
                                Write-Log -Subtext "Poster url: $global:posterurl" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                                if ($global:posterurl -like 'https://image.tmdb.org*') {
                                    Write-Log -Subtext "Downloading Poster from 'TMDB'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type debug
                                    if ($global:FavProvider -ne 'TMDB') { 
                                        $global:IsFallback = $true
                                    }
                                }
                                elseif ($global:posterurl -like 'https://assets.fanart.tv*') {
                                    Write-Log -Subtext "Downloading Poster from 'Fanart.tv'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type debug
                                    $PosterUnknownCount++
                                    if ($global:FavProvider -ne 'FANART') { 
                                        $global:IsFallback = $true
                                    }
                                }
                                elseif ($global:posterurl -like 'https://artworks.thetvdb.com*') {
                                    Write-Log -Subtext "Downloading Poster from 'TVDB'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type debug
                                    if ($global:FavProvider -ne 'TVDB') { 
                                        $global:IsFallback = $true
                                    }
                                }
                                Else {
                                    Write-Log -Subtext "Downloading Poster from 'IMDB'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type debug
                                    $PosterUnknownCount++
                                    if ($global:FavProvider -ne 'IMDB') { 
                                        $global:IsFallback = $true
                                    }
                                }
                                if (Get-ChildItem -LiteralPath $SeasonImage -ErrorAction SilentlyContinue) {
                                    # Resize Image to 2000x3000 and apply Border and overlay
                                    if ($AddBorder -eq 'true' -and $AddOverlay -eq 'true') {
                                        $Arguments = "`"$SeasonImage`" -resize 2000x3000^ -gravity center -extent 2000x3000 `"$overlay`" -gravity south -composite -shave `"$borderwidthsecond`"  -bordercolor `"$bordercolor`" -border `"$borderwidth`" `"$SeasonImage`""
                                        Write-log -Subtext "Resizing it | Adding Borders | Adding Overlay" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                                    }
                                    if ($AddBorder -eq 'true' -and $AddOverlay -eq 'false') {
                                        $Arguments = "`"$SeasonImage`" -resize 2000x3000^ -gravity center -extent 2000x3000 -shave `"$borderwidthsecond`"  -bordercolor `"$bordercolor`" -border `"$borderwidth`" `"$SeasonImage`""
                                        Write-log -Subtext "Resizing it | Adding Borders" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                                    }
                                    if ($AddBorder -eq 'false' -and $AddOverlay -eq 'true') {
                                        $Arguments = "`"$SeasonImage`" -resize 2000x3000^ -gravity center -extent 2000x3000 `"$overlay`" -gravity south -composite `"$SeasonImage`""
                                        Write-log -Subtext "Resizing it | Adding Overlay" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                                    }
                                    if ($AddBorder -eq 'false' -and $AddOverlay -eq 'false') {
                                        $Arguments = "`"$SeasonImage`" -resize 2000x3000^ -gravity center -extent 2000x3000 `"$SeasonImage`""
                                        Write-log -Subtext "Resizing it" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                                    }
                                        
                                    $logEntry = "magick.exe $Arguments"
                                    $logEntry | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append 
                                    Start-Process $magick -Wait -NoNewWindow -ArgumentList $Arguments
                                        
                                    if ($AddText -eq 'true') {
                                        $optimalFontSize = Get-OptimalPointSize -text $global:seasonTitle -font $fontImagemagick -box_width $MaxWidth  -box_height $MaxHeight -min_pointsize $minPointSize -max_pointsize $maxPointSize
                                                
                                        Write-log -Subtext "Optimal font size set to: '$optimalFontSize'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                                                
                                        $Arguments = "`"$SeasonImage`" -gravity center -background None -layers Flatten `( -font `"$fontImagemagick`" -pointsize `"$optimalFontSize`" -fill `"$fontcolor`" -size `"$boxsize`" -background none caption:`"$global:seasonTitle`" -trim -gravity south -extent `"$boxsize`" `) -gravity south -geometry +0`"$text_offset`" -composite `"$SeasonImage`""
                                                
                                        Write-log -Subtext "Applying Font text: `"$global:seasonTitle`"" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                                        $logEntry = "magick.exe $Arguments"
                                        $logEntry | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append 
                                        Start-Process $magick -Wait -NoNewWindow -ArgumentList $Arguments
                                    }
                                }
                            }
                            Else {
                                Invoke-WebRequest -Uri $global:posterurl -OutFile $SeasonImage
                                Write-Log -Subtext "Poster url: $global:posterurl" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                                if ($global:posterurl -like 'https://image.tmdb.org*') {
                                    Write-Log -Subtext "Downloading Poster from 'TMDB'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type debug
                                    if ($global:FavProvider -ne 'TMDB') { 
                                        $global:IsFallback = $true
                                    }
                                }
                                elseif ($global:posterurl -like 'https://assets.fanart.tv*') {
                                    Write-Log -Subtext "Downloading Poster from 'Fanart.tv'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type debug
                                    $PosterUnknownCount++
                                    if ($global:FavProvider -ne 'FANART') { 
                                        $global:IsFallback = $true
                                    }
                                }
                                elseif ($global:posterurl -like 'https://artworks.thetvdb.com*') {
                                    Write-Log -Subtext "Downloading Poster from 'TVDB'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type debug
                                    if ($global:FavProvider -ne 'TVDB') { 
                                        $global:IsFallback = $true
                                    }
                                }
                                Else {
                                    Write-Log -Subtext "Downloading Poster from 'IMDB'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type debug
                                    $PosterUnknownCount++
                                    if ($global:FavProvider -ne 'IMDB') { 
                                        $global:IsFallback = $true
                                    }
                                }
                                if (Get-ChildItem -LiteralPath $SeasonImage -ErrorAction SilentlyContinue) {    
                                    # Resize Image to 2000x3000
                                    $Resizeargument = "`"$SeasonImage`" -resize 2000x3000^ -gravity center -extent 2000x3000 `"$SeasonImage`""
                                    Write-log -Subtext "Resizing it... " -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                                    $logEntry = "magick.exe $Resizeargument"
                                    $logEntry | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append 
                                    Start-Process $magick -Wait -NoNewWindow -ArgumentList $Resizeargument
                                }
                            }
                            if (Get-ChildItem -LiteralPath $SeasonImage -ErrorAction SilentlyContinue) {
                                # Move file back to original naming with Brackets.
                                Move-Item -LiteralPath $SeasonImage -destination $SeasonImageoriginal -Force -ErrorAction SilentlyContinue
                                $SeasonCount++
                            }
                        }
                        Else {
                            Write-log -Subtext "Missing poster URL for: $($entry.title)" -Path $global:ScriptRoot\Logs\Scriptlog.log  -Type Error
                            $Errorcount++
                        }
                        $seasontemp = New-Object psobject
                        $seasontemp | Add-Member -MemberType NoteProperty -Name "Title" -Value $($Titletext + " | " + $global:season)
                        $seasontemp | Add-Member -MemberType NoteProperty -Name "Type" -Value 'Season'
                        $seasontemp | Add-Member -MemberType NoteProperty -Name "Rootfolder" -Value $($entry.RootFoldername)
                        $seasontemp | Add-Member -MemberType NoteProperty -Name "LibraryName" -Value $($entry.'Library Name')
                        $seasontemp | Add-Member -MemberType NoteProperty -Name "Textless" -Value $(if ($global:TextlessPoster) { 'True' } else { 'False' })
                        $seasontemp | Add-Member -MemberType NoteProperty -Name "Fallback" -Value $(if ($global:IsFallback) { 'True' } else { 'False' })
                        $seasontemp | Add-Member -MemberType NoteProperty -Name "TextTruncated" -Value $(if ($global:IsTruncated) { 'True' } else { 'False' })
                        $seasontemp | Add-Member -MemberType NoteProperty -Name "Url" -Value $global:posterurl
        
                        # Export the array to a CSV file
                        $seasontemp | Export-Csv -Path "$global:ScriptRoot\Logs\PosterChoices.csv" -NoTypeInformation -Delimiter ';' -Encoding UTF8 -Force -Append
                    }
                }
            }
        }
        Else {
            Write-log -Message "Missing RootFolder for: $($entry.title) - you have to manually create the poster for it..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Error
            $Errorcount++
        }
    }
    $endTime = Get-Date
    $executionTime = New-TimeSpan -Start $startTime -End $endTime
    # Format the execution time
    $hours = [math]::Floor($executionTime.TotalHours)
    $minutes = $executionTime.Minutes
    $seconds = $executionTime.Seconds
    $FormattedTimespawn = $hours.ToString() + "h " + $minutes.ToString() + "m " + $seconds.ToString() + "s "

    Write-log -Message "Finished, Total posters created: $posterCount | Total Season Posters created: $SeasonCount" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Success
    Write-log -Message "You can find a detailed Summery of Poster Choices here: $global:ScriptRoot\Logs\PosterChoices.csv" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
    # Calculate Summery
    $SummeryCount = Import-Csv -LiteralPath "$global:ScriptRoot\Logs\PosterChoices.csv" -Delimiter ';'
    $FallbackCount = @($SummeryCount | Where-Object Fallback -eq 'True')
    $TextlessCount = @($SummeryCount | Where-Object Textless -eq 'True')
    $TextTruncatedCount = @($SummeryCount | Where-Object TextTruncated -eq 'True')
    $TextCount = @($SummeryCount | Where-Object Textless -eq 'False')

    if ($TextlessCount) {
        Write-log -Subtext "'$($TextlessCount.count)' times the script took a Textless poster" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Warning
    }
    if ($FallbackCount) {
        Write-log -Subtext "'$($FallbackCount.count)' times the script took a fallback poster" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Warning
    }
    if ($TextCount) {
        Write-log -Subtext "'$($TextCount.count)' times the script took a poster with Text" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Warning
    }
    if ($PosterUnknownCount -ge '1') {
        Write-log -Subtext "'$PosterUnknownCount' times the script took a season poster where we cant tell if it has text or not" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Warning
    }
    if ($TextTruncatedCount) {
        Write-log -Subtext "'$($TextTruncatedCount.count)' times the script truncated the text in poster" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Warning
    }
    if ($Errorcount -ge '1') {
        Write-log -Message "During execution '$Errorcount' Errors occurred, please check log for detailed description." -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
    }
    Write-log -Message "Script execution time: $FormattedTimespawn" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
}