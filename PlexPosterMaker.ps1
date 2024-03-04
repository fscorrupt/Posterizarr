param (
    [switch]$Manual,
    [switch]$Testing
)

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
    $Linenumber = "L"+"."+"$($MyInvocation.ScriptLineNumber)"
    $TypeFormatted = "[{0}] {1}|{2}" -f $Timestamp, $PaddedType.ToUpper(),$Linenumber

    if ($Message) {
        $FormattedLine1 = "{0}| {1}" -f ($TypeFormatted, $Message)
        $FormattedLineWritehost = "{0}| " -f ($TypeFormatted)
    }

    if ($Subtext) {
        $FormattedLine = "{0}|      {1}" -f ($TypeFormatted, $Subtext)
        $FormattedLineWritehost = "{0}|      " -f ($TypeFormatted)
        Write-Host $FormattedLineWritehost -NoNewline
        Write-Host $Subtext -ForegroundColor $Color
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
Function Get-OptimalPointSize {
    param(
        [string]$text,
        [string]$fontImagemagick,
        [int]$box_width,
        [int]$box_height,
        [int]$min_pointsize,
        [int]$max_pointsize
    )
    # stolen and adapted from: https://github.com/bullmoose20/Plex-Stuff/blob/9d231d871a4676c8da7d4cbab482181a35756524/create_defaults/create_default_posters.ps1#L477 
    
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
function GetTMDBMovieBackground {
    Write-log -Subtext "Searching on TMDB for a movie background" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Trace
    if ($global:PreferTextless -eq 'True') {
        try {
            $response = (Invoke-WebRequest -Uri "https://api.themoviedb.org/3/movie/$($global:tmdbid)?append_to_response=images&language=xx&include_image_language=en,null,de" -Method GET -Headers $global:headers -ErrorAction SilentlyContinue).content | ConvertFrom-Json -ErrorAction SilentlyContinue    
        }
        catch {
        }
        if ($response) {
            if ($response.images.backdrops) {
                $NoLangPoster = ($response.images.backdrops | Where-Object iso_639_1 -eq $null)
                if (!$NoLangPoster) {
                    $posterpath = (($response.images.backdrops | Sort-Object vote_average -Descending)[0]).file_path
                    $global:posterurl = "https://image.tmdb.org/t/p/original$posterpath"
                    if ($global:FavProvider -eq 'TMDB') {
                        $global:Fallback = "fanart"
                        $global:tmdbfallbackposterurl = $global:posterurl
                    }
                    Write-log -Subtext "Found background with text on TMDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Optional
                    $global:PosterWithText = $true
                }
                Else {
                    $posterpath = (($response.images.backdrops | Where-Object iso_639_1 -eq $null | Sort-Object vote_average -Descending)[0]).file_path
                    if ($posterpath) {
                        $global:posterurl = "https://image.tmdb.org/t/p/original$posterpath"
                        Write-log -Subtext "Found Textless background on TMDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Success
                        $global:TextlessPoster = $true
                        return $global:posterurl
                    }
                }
            }
            Else {
                Write-log -Subtext "No Background found on TMDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Warning
                if ($global:FavProvider -eq 'TMDB') {
                    $global:Fallback = "fanart"
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
            if ($response.images.backdrops) {
                foreach ($lang in $global:PreferedLanguageOrderTMDB) {
                    if ($lang -eq 'null') {
                        $FavPoster = ($response.images.backdrops | Where-Object iso_639_1 -eq $null)
                    }
                    Else {
                        $FavPoster = ($response.images.backdrops | Where-Object iso_639_1 -eq $lang)
                    }
                    if ($FavPoster) {
                        $posterpath = (($FavPoster | Sort-Object vote_average -Descending)[0]).file_path
                        $global:posterurl = "https://image.tmdb.org/t/p/original$posterpath"
                        if ($lang -eq 'null') {
                            Write-log -Subtext "Found background without Language on TMDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Optional
                        }
                        Else {
                            Write-log -Subtext "Found background with Language '$lang' on TMDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Optional
                        }
                        if ($lang -ne 'null') {
                            $global:PosterWithText = $true
                        }
                        return $global:posterurl
                        break
                    }
                }
                if (!$global:posterurl) {
                    Write-log -Subtext "No Background found on TMDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Warning
                    $global:Fallback = "fanart"
                }
            }
            Else {
                Write-log -Subtext "No Background found on TMDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Warning
                if ($global:FavProvider -eq 'TMDB') {
                    $global:Fallback = "fanart"
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
            if ($global:SeasonNumber -match '\b\d{1,2}\b') {
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
function GetTMDBShowBackground {
    Write-log -Subtext "Searching on TMDB for a show background" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Trace
    if ($global:PreferTextless -eq 'True') {
        try {
            $response = (Invoke-WebRequest -Uri "https://api.themoviedb.org/3/tv/$($global:tmdbid)?append_to_response=images&language=xx&include_image_language=en,null,de" -Method GET -Headers $global:headers -ErrorAction SilentlyContinue).content | ConvertFrom-Json -ErrorAction SilentlyContinue    
        }
        catch {
        }
        if ($response) {
            if ($response.images.backdrops) {
                $NoLangPoster = ($response.images.backdrops | Where-Object iso_639_1 -eq $null)
                if (!$NoLangPoster) {
                    $posterpath = (($response.images.backdrops | Sort-Object vote_average -Descending)[0]).file_path
                    $global:posterurl = "https://image.tmdb.org/t/p/original$posterpath"
                    if ($global:FavProvider -eq 'TMDB') {
                        $global:Fallback = "fanart"
                        $global:tmdbfallbackposterurl = $global:posterurl
                    }
                    Write-log -Subtext "Found background with text on TMDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Optional
                    $global:PosterWithText = $true
                }
                Else {
                    $posterpath = (($response.images.backdrops | Where-Object iso_639_1 -eq $null | Sort-Object vote_average -Descending)[0]).file_path
                    if ($posterpath) {
                        $global:posterurl = "https://image.tmdb.org/t/p/original$posterpath"
                        Write-log -Subtext "Found Textless background on TMDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Success
                        $global:TextlessPoster = $true
                        return $global:posterurl
                    }
                }
                if (!$global:posterurl) {
                    Write-log -Subtext "No Background found on TMDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Warning
                    $global:Fallback = "fanart"
                }
            }
            Else {
                Write-log -Subtext "No Background found on TMDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Warning
                if ($global:FavProvider -eq 'TMDB') {
                    $global:Fallback = "fanart"
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
            if ($response.images.backdrops) {
                foreach ($lang in $global:PreferedLanguageOrderTMDB) {
                    if ($lang -eq 'null') {
                        $FavPoster = ($response.images.backdrops | Where-Object iso_639_1 -eq $null)
                    }
                    Else {
                        $FavPoster = ($response.images.backdrops | Where-Object iso_639_1 -eq $lang)
                    }
                    if ($FavPoster) {
                        $posterpath = (($FavPoster | Sort-Object vote_average -Descending)[0]).file_path
                        $global:posterurl = "https://image.tmdb.org/t/p/original$posterpath"
                        if ($lang -eq 'null') {
                            Write-log -Subtext "Found background without Language on TMDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Optional
                        }
                        Else {
                            Write-log -Subtext "Found background with Language '$lang' on TMDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Optional
                        }
                        if ($lang -ne 'null') {
                            $global:PosterWithText = $true
                        }
                        return $global:posterurl
                        break
                    }
                }
                if (!$global:posterurl) {
                    Write-log -Subtext "No Background found on TMDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Warning
                    $global:Fallback = "fanart"
                }
            }
            Else {
                Write-log -Subtext "No Background found on TMDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Warning
                if ($global:FavProvider -eq 'TMDB') {
                    $global:Fallback = "fanart"
                }
            }
        }
        Else {
            Write-log -Subtext "TMDB Api Response is null" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Error
        }
    }
}
function GetTMDBTitleCard {
    Write-log -Subtext "Searching on TMDB for: $global:show_name 'Season $global:season_number - Episode $global:episodenumber' Title Card" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Trace
    try {
        $response = (Invoke-WebRequest -Uri "https://api.themoviedb.org/3/tv/$($global:tmdbid)/season/$($global:season_number)/episode/$($global:episodenumber)/images?append_to_response=images&language=xx&include_image_language=en,null,de" -Method GET -Headers $global:headers -ErrorAction SilentlyContinue).content | ConvertFrom-Json -ErrorAction SilentlyContinue            
    }
    catch {
    }
    if ($response) {
        if ($response.stills) {
            $NoLangPoster = ($response.stills | Where-Object iso_639_1 -eq $null)
            if (!$NoLangPoster) {
                $posterpath = (($response.stills | Sort-Object vote_average -Descending)[0]).file_path
                $global:posterurl = "https://image.tmdb.org/t/p/original$posterpath"
                Write-log -Subtext "Found Title Card with text on TMDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Optional
                $global:PosterWithText = $true
                return $global:posterurl
            }
            Else {
                $posterpath = (($response.stills | Where-Object iso_639_1 -eq $null | Sort-Object vote_average -Descending)[0]).file_path
                if ($posterpath) {
                    $global:posterurl = "https://image.tmdb.org/t/p/original$posterpath"
                    Write-log -Subtext "Found Textless Title Card on TMDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Success
                    $global:TextlessPoster = $true
                    return $global:posterurl
                }
            }
        }
        Else {
            Write-log -Subtext "No Title Card on TMDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type error
            $global:Fallback = "TVDB"
        }
    }
    Else {
        Write-log -Subtext "TMDB Api Response is null" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Warning
        $global:Fallback = "TVDB"
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
function GetFanartMovieBackground {
    $global:Fallback = $null
    Write-log -Subtext "Searching on Fanart.tv for a Background poster" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Trace
    $ids = @($global:tmdbid, $global:tvdbid, $global:imdbid)
    $entrytemp = $null
        
    foreach ($id in $ids) {
        if ($id) {
            $entrytemp = Get-FanartTv -Type movies -id $id -ErrorAction SilentlyContinue
            if ($entrytemp -and $entrytemp.moviebackground) {
                if (!($entrytemp.moviebackground | Where-Object lang -eq '')) {
                    $global:posterurl = ($entrytemp.moviebackground)[0].url
                    Write-log -Subtext "Found Background with text on Fanart.tv"  -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Optional
                    $global:PosterWithText = $true
                    if ($global:FavProvider -eq 'FANART') {
                        $global:Fallback = "TMDB"
                        $global:fanartfallbackposterurl = ($entrytemp.moviebackground)[0].url
                    }
                    break
                }
                Else {
                    $global:posterurl = ($entrytemp.moviebackground | Where-Object lang -eq '')[0].url
                    Write-log -Subtext "Found Textless background on Fanart.tv" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Success
                    $global:TextlessPoster = $true
                    break
                }
            }
        }
    }
    if (!$global:posterurl) {
        Write-log -Subtext "No movie match or background found on Fanart.tv" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Warning
        $global:Fallback = "TMDB"
    }
    Else {
        return $global:posterurl
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
function GetFanartShowBackground {
    $global:Fallback = $null
    Write-log -Subtext "Searching on Fanart.tv for a Background poster" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Trace
    $ids = @($global:tmdbid, $global:tvdbid, $global:imdbid)
    $entrytemp = $null
        
    foreach ($id in $ids) {
        if ($id) {
            $entrytemp = Get-FanartTv -Type tv -id $id -ErrorAction SilentlyContinue
            if ($entrytemp -and $entrytemp.showbackground) {
                if (!($entrytemp.showbackground | Where-Object lang -eq '')) {
                    $global:posterurl = ($entrytemp.showbackground)[0].url
                    Write-log -Subtext "Found Background with text on Fanart.tv"  -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Optional
                    $global:PosterWithText = $true
                    if ($global:FavProvider -eq 'FANART') {
                        $global:Fallback = "TMDB"
                        $global:fanartfallbackposterurl = ($entrytemp.showbackground)[0].url
                    }
                    break
                }
                Else {
                    $global:posterurl = ($entrytemp.showbackground | Where-Object lang -eq '')[0].url
                    Write-log -Subtext "Found Textless background on Fanart.tv" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Success
                    $global:TextlessPoster = $true
                    break
                }
            }
        }
    }

    if (!$global:posterurl) {
        Write-log -Subtext "No show match or background found on Fanart.tv" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Warning
        $global:Fallback = "TMDB"
    }
    Else {
        return $global:posterurl
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
                    if ($global:SeasonNumber -match '\b\d{1,2}\b') {
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
function GetTVDBMovieBackground {
    if ($global:tvdbid) {
        if ($global:PreferTextless -eq 'True') {
            Write-log -Subtext "Searching on TVDB for a movie Background" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Trace
            try {
                $response = (Invoke-WebRequest -Uri "https://api4.thetvdb.com/v4/movies/$($global:tvdbid)/extended" -Method GET -Headers $global:tvdbheader).content | ConvertFrom-Json
            }
            catch {
            }
            if ($response) {
                if ($response.data.artworks) {
                    $global:posterurl = ($response.data.artworks | Where-Object { $_.language -eq $null -and $_.type -eq '15' } | Sort-Object Score)[0].image
                    Write-log -Subtext "Found Textless Background on TVDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Optional
                    return $global:posterurl
                }
                Else {
                    Write-log -Subtext "No Background found on TVDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Warning
                }
            }
            Else {
                Write-log -Subtext "TVDB Api Response is null" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Error
            }
        }
        Else {
            Write-log -Subtext "Searching on TVDB for a movie Background" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Trace
            try {
                $response = (Invoke-WebRequest -Uri "https://api4.thetvdb.com/v4/movies/$($global:tvdbid)/extended" -Method GET -Headers $global:tvdbheader).content | ConvertFrom-Json
            }
            catch {
            }
            if ($response) {
                if ($response.data.artworks) {
                    foreach ($lang in $global:PreferedLanguageOrderTVDB) {
                        if ($lang -eq 'null') {
                            $LangArtwork = ($response.data.artworks | Where-Object { $_.language -like "" -and $_.type -eq '15' } | Sort-Object Score)
                        }
                        Else {
                            $LangArtwork = ($response.data.artworks | Where-Object { $_.language -like "$lang*" -and $_.type -eq '15' } | Sort-Object Score)
                        }
                        if ($LangArtwork) {
                            $global:posterurl = $LangArtwork[0].image
                            if ($lang -eq 'null') {
                                Write-log -Subtext "Found Background without Language on TVDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Optional
                            }
                            Else {
                                Write-log -Subtext "Found Background with Language '$lang' on TVDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Optional
                            }
                            if ($lang -ne 'null') {
                                $global:PosterWithText = $true
                            }
                            return $global:posterurl
                            break
                        }
                    }
                    if (!$global:posterurl) {
                        Write-log -Subtext "No background found on TVDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Warning
                    }
                }
                Else {
                    Write-log -Subtext "No Background found on TVDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Warning
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
                    $NoLangImageUrl = $response.data.artworks | Where-Object { $_.language -eq $null -and $_.type -eq '2' }
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
                            $LangArtwork = ($response.data.artworks | Where-Object { $_.language -like "" -and $_.type -eq '2' } | Sort-Object Score -Descending)
                        }
                        Else {
                            $LangArtwork = ($response.data.artworks | Where-Object { $_.language -like "$lang*" -and $_.type -eq '2' } | Sort-Object Score -Descending)
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
function GetTVDBShowBackground {
    if ($global:tvdbid) {
        Write-log -Subtext "Searching on TVDB for a background" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Trace
        if ($global:PreferTextless -eq 'True') {
            try {
                $response = (Invoke-WebRequest -Uri "https://api4.thetvdb.com/v4/series/$($global:tvdbid)/artworks" -Method GET -Headers $global:tvdbheader).content | ConvertFrom-Json
            }
            catch {
            }
            if ($response) {
                if ($response.data) {
                    $defaultImageurl = $response.data.image
                    $NoLangImageUrl = $response.data.artworks | Where-Object { $_.language -eq $null -and $_.type -eq '3' }
                    if ($NoLangImageUrl) {
                        $global:posterurl = $NoLangImageUrl[0].image
                        Write-log -Subtext "Found Textless background on TVDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Optional
                        $global:TextlessPoster = $true
                    }
                    Else {
                        $global:posterurl = $defaultImageurl
                        Write-log -Subtext "Found background with text on TVDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Optional
                    }
                    return $global:posterurl
                }
                Else {
                    Write-log -Subtext "No background found on TVDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Warning
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
                            $LangArtwork = ($response.data.artworks | Where-Object { $_.language -like "" -and $_.type -eq '3' } | Sort-Object Score -Descending)
                        }
                        Else {
                            $LangArtwork = ($response.data.artworks | Where-Object { $_.language -like "$lang*" -and $_.type -eq '3' } | Sort-Object Score -Descending)
                        }
                        if ($LangArtwork) {
                            $global:posterurl = $LangArtwork[0].image
                            if ($lang -eq 'null') {
                                Write-log -Subtext "Found background without Language on TVDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Optional
                            }
                            Else {
                                Write-log -Subtext "Found background with Language '$lang' on TVDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Optional
                            }
                            if ($lang -ne 'null') {
                                $global:PosterWithText = $true
                            }
                            return $global:posterurl
                            break
                        }
                    }
                    if (!$global:posterurl) {
                        Write-log -Subtext "No background found on TVDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Warning
                    }
                }
                Else {
                    Write-log -Subtext "No background found on TVDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Warning
                }
            }
            Else {
                Write-log -Subtext "TVDB Api Response is null" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Error
            }
        }
    }
}
function GetTVDBTitleCard {
    if ($global:tvdbid) {
        Write-log -Subtext "Searching on TVDB for a Title Card" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Trace
        try {
            $response = (Invoke-WebRequest -Uri "https://api4.thetvdb.com/v4/series/$($global:tvdbid)/episodes/default?" -Method GET -Headers $global:tvdbheader).content | ConvertFrom-Json
        }
        catch {
        }
        if ($response) {
            if ($response.data.episodes) {
                $NoLangImageUrl = $response.data.episodes | Where-Object { $_.seasonNumber -eq $global:season_number -and $_.number -eq $global:episodenumber }
                if ($NoLangImageUrl) {
                    $global:posterurl = $NoLangImageUrl[0].image
                    Write-log -Subtext "Found Textless Title Card on TVDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Optional
                    $global:TextlessPoster = $true
                }
                Else {
                    Write-log -Subtext "Found Title Card with text on TVDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Optional
                }
                return $global:posterurl
            }
            Else {
                Write-log -Subtext "No Title Card found on TVDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Warning
            }
        }
        Else {
            Write-log -Subtext "TVDB Api Response is null" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Error
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
    $global:PreferedLanguageOrder = "xx", "en", "de"
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

# Check if its a Network Share
if ($AssetPath.StartsWith("\")) { 
    # add \ if it only Starts with one
    if (!$AssetPath.StartsWith("\\")) { 
        $AssetPath = "\" + $AssetPath
    }
}

$global:ScriptRoot = $PSScriptRoot
$magickinstalllocation = RemoveTrailingSlash $config.PrerequisitePart.magickinstalllocation
$font = "$global:ScriptRoot\temp\$($config.PrerequisitePart.font)"
$backgroundfont = "$global:ScriptRoot\temp\$($config.PrerequisitePart.backgroundfont)"
$titlecardfont = "$global:ScriptRoot\temp\$($config.PrerequisitePart.titlecardfont)"
$Posteroverlay = "$global:ScriptRoot\temp\$($config.PrerequisitePart.overlayfile)"
$Backgroundoverlay = "$global:ScriptRoot\temp\$($config.PrerequisitePart.backgroundoverlayfile)"
$titlecardoverlay = "$global:ScriptRoot\temp\$($config.PrerequisitePart.titlecardoverlayfile)"
$testimage = "$global:ScriptRoot\test\testimage.png"
$backgroundtestimage = "$global:ScriptRoot\test\backgroundtestimage.png"
$LibraryFolders = $config.PrerequisitePart.LibraryFolders
$global:SeasonPosters = $config.PrerequisitePart.SeasonPosters
$global:BackgroundPosters = $config.PrerequisitePart.BackgroundPosters
$global:TitleCards = $config.PrerequisitePart.TitleCards

# Poster Overlay Part
$global:ImageProcessing = $config.OverlayPart.ImageProcessing

# Poster Overlay Part
$fontAllCaps = $config.PosterOverlayPart.fontAllCaps
$AddBorder = $config.PosterOverlayPart.AddBorder
$AddText = $config.PosterOverlayPart.AddText
$AddOverlay = $config.PosterOverlayPart.AddOverlay
$fontcolor = $config.PosterOverlayPart.fontcolor
$bordercolor = $config.PosterOverlayPart.bordercolor
$minPointSize = $config.PosterOverlayPart.minPointSize
$maxPointSize = $config.PosterOverlayPart.maxPointSize
$borderwidth = $config.PosterOverlayPart.borderwidth
$MaxWidth = $config.PosterOverlayPart.MaxWidth
$MaxHeight = $config.PosterOverlayPart.MaxHeight
$text_offset = $config.PosterOverlayPart.text_offset
$borderwidthsecond = $borderwidth + 'x' + $borderwidth
$boxsize = $MaxWidth + 'x' + $MaxHeight

# Background Overlay Part
$BackgroundfontAllCaps = $config.BackgroundOverlayPart.fontAllCaps
$AddBackgroundOverlay = $config.BackgroundOverlayPart.AddOverlay
$AddBackgroundBorder = $config.BackgroundOverlayPart.AddBorder
$AddBackgroundText = $config.BackgroundOverlayPart.AddText
$Backgroundfontcolor = $config.BackgroundOverlayPart.fontcolor
$Backgroundbordercolor = $config.BackgroundOverlayPart.bordercolor
$BackgroundminPointSize = $config.BackgroundOverlayPart.minPointSize
$BackgroundmaxPointSize = $config.BackgroundOverlayPart.maxPointSize
$Backgroundborderwidth = $config.BackgroundOverlayPart.borderwidth
$BackgroundMaxWidth = $config.BackgroundOverlayPart.MaxWidth
$BackgroundMaxHeight = $config.BackgroundOverlayPart.MaxHeight
$Backgroundtext_offset = $config.BackgroundOverlayPart.text_offset
$Backgroundborderwidthsecond = $Backgroundborderwidth + 'x' + $Backgroundborderwidth
$Backgroundboxsize = $BackgroundMaxWidth + 'x' + $BackgroundMaxHeight

# Title Card Overlay Part
$AddTitleCardOverlay = $config.TitleCardOverlayPart.AddOverlay
$AddTitleCardBorder = $config.TitleCardOverlayPart.AddBorder
$TitleCardborderwidth = $config.TitleCardOverlayPart.borderwidth
$TitleCardbordercolor = $config.TitleCardOverlayPart.bordercolor

# Title Card Title Text Part
$TitleCardEPTitlefontAllCaps = $config.TitleCardTitleTextPart.fontAllCaps
$AddTitleCardEPTitleText = $config.TitleCardTitleTextPart.AddEPTitleText
$TitleCardEPTitlefontcolor = $config.TitleCardTitleTextPart.fontcolor
$TitleCardEPTitleminPointSize = $config.TitleCardTitleTextPart.minPointSize
$TitleCardEPTitlemaxPointSize = $config.TitleCardTitleTextPart.maxPointSize
$TitleCardEPTitleMaxWidth = $config.TitleCardTitleTextPart.MaxWidth
$TitleCardEPTitleMaxHeight = $config.TitleCardTitleTextPart.MaxHeight
$TitleCardEPTitletext_offset = $config.TitleCardTitleTextPart.text_offset

# Title Card EP Text Part
$TitleCardEPfontAllCaps = $config.TitleCardEPTextPart.fontAllCaps
$AddTitleCardEPText = $config.TitleCardEPTextPart.AddEPText
$TitleCardEPfontcolor = $config.TitleCardEPTextPart.fontcolor
$TitleCardEPminPointSize = $config.TitleCardEPTextPart.minPointSize
$TitleCardEPmaxPointSize = $config.TitleCardEPTextPart.maxPointSize
$TitleCardEPMaxWidth = $config.TitleCardEPTextPart.MaxWidth
$TitleCardEPMaxHeight = $config.TitleCardEPTextPart.MaxHeight
$TitleCardEPtext_offset = $config.TitleCardEPTextPart.text_offset

$TitleCardborderwidthsecond = $TitleCardborderwidth + 'x' + $TitleCardborderwidth
$TitleCardEPTitleboxsize = $TitleCardEPTitleMaxWidth + 'x' + $TitleCardEPTitleMaxHeight
$TitleCardEPboxsize = $TitleCardEPMaxWidth + 'x' + $TitleCardEPMaxHeight

$PosterSize = "2000x3000"
$BackgroundSize = "3840x2160"
$fontImagemagick = $font.replace('\', '\\')
$backgroundfontImagemagick = $backgroundfont.replace('\', '\\')
$TitleCardfontImagemagick = $TitleCardfont.replace('\', '\\')
$magick = "$magickinstalllocation\magick.exe"
$fileExtensions = @(".otf", ".ttf", ".otc", ".ttc", ".png")
$Errorcount = 0

# Initialize Other Variables
$SeasonsTemp = $null
$SeasonNames = $null
$SeasonNumbers = $null
$SeasonRatingkeys = $null

if (!(Test-Path $global:ScriptRoot\Logs)) {
    New-Item -ItemType Directory -Path $global:ScriptRoot\Logs -Force | out-null
}

if (!(Test-Path $global:ScriptRoot\temp)) {
    New-Item -ItemType Directory -Path $global:ScriptRoot\temp -Force | out-null
}

if (!(Test-Path $global:ScriptRoot\test)) {
    New-Item -ItemType Directory -Path $global:ScriptRoot\test -Force | out-null
}

if (!(Test-Path $AssetPath)) {
    New-Item -ItemType Directory -Path $AssetPath -Force | out-null
}

# Delete all files and subfolders within the temp directory
if (Test-Path $global:ScriptRoot\temp) {
    Remove-Item -Path $global:ScriptRoot\temp\* -Recurse -Force
}

# Test if files are present in Script root
if (!(Test-Path $Posteroverlay)) {
    Invoke-WebRequest -uri "https://github.com/fscorrupt/Plex-Poster-Maker/raw/main/overlay.png" -OutFile $global:ScriptRoot\temp\overlay.png 
}
if (!(Test-Path $Backgroundoverlay)) {
    Invoke-WebRequest -uri "https://github.com/fscorrupt/Plex-Poster-Maker/raw/main/backgroundoverlay.png" -OutFile $global:ScriptRoot\temp\backgroundoverlay.png 
}
if (!(Test-Path $font)) {
    Invoke-WebRequest -uri "https://github.com/fscorrupt/Plex-Poster-Maker/raw/main/Rocky.ttf" -OutFile $global:ScriptRoot\temp\Rocky.ttf
}


# cleanup old logfile
if ($Manual) {
    if ((Test-Path $global:ScriptRoot\Logs\Manuallog.log)) {
        Remove-Item $global:ScriptRoot\Logs\Manuallog.log
        Write-log -Message "Old log files cleared..." -Path $global:ScriptRoot\Logs\Manuallog.log -Type Warning
    }
    if ((Test-Path $global:ScriptRoot\Logs\ImageMagickCommands.log)) {
        Remove-Item $global:ScriptRoot\Logs\ImageMagickCommands.log
    }
}
Elseif ($Testing) {
    if ((Test-Path $global:ScriptRoot\Logs\Testinglog.log)) {
        Remove-Item $global:ScriptRoot\Logs\Testinglog.log
        Write-log -Message "Old log files cleared..." -Path $global:ScriptRoot\Logs\Testinglog.log -Type Warning
    }
    if ((Test-Path $global:ScriptRoot\Logs\ImageMagickCommands.log)) {
        Remove-Item $global:ScriptRoot\Logs\ImageMagickCommands.log
    }
}
Else {
    if ((Test-Path $global:ScriptRoot\Logs\ImageMagickCommands.log)) {
        Remove-Item $global:ScriptRoot\Logs\ImageMagickCommands.log
    }
    if ((Test-Path $global:ScriptRoot\Logs\Scriptlog.log)) {
        Remove-Item $global:ScriptRoot\Logs\Scriptlog.log
    }
    if ((Test-Path "$global:ScriptRoot\Logs\ImageChoices.csv")) {
        Remove-Item "$global:ScriptRoot\Logs\ImageChoices.csv"
    }
    Write-log -Message "Old log files cleared..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Warning
}

$configLogging = "$global:ScriptRoot\Logs\Scriptlog.log"

if ($Manual) {
    $configLogging = "$global:ScriptRoot\Logs\Manuallog.log"
}
if ($Testing) {
    $configLogging = "$global:ScriptRoot\Logs\Testinglog.log"
}

# Display Current Config settings:
Write-log -Message "Current Config.json Settings" -Path $configLogging -Type Trace
Write-log -Subtext "___________________________________________" -Path $configLogging -Type Debug
# Plex Part
Write-log -Subtext "API Part" -Path $configLogging -Type Trace
Write-log -Subtext "| TVDB API Key:                 $($global:tvdbapi[0..7] -join '')****" -Path $configLogging -Type Info
Write-log -Subtext "| TMDB API Token:               $($global:tmdbtoken[0..7] -join '')****" -Path $configLogging -Type Info
Write-log -Subtext "| Fanart API Key:               $($FanartTvAPIKey[0..7] -join '')****" -Path $configLogging -Type Info
if ($PlexToken) {
    Write-log -Subtext "| Plex Token:                   $($PlexToken[0..7] -join '')****" -Path $configLogging  -Type Info
}
Write-log -Subtext "| Fav Provider:                 $global:FavProvider" -Path $configLogging  -Type Info
Write-log -Subtext "| Prefered Lang Order:          $($global:PreferedLanguageOrder -join ',')" -Path $configLogging  -Type Info
Write-log -Subtext "Plex Part" -Path $configLogging  -Type Trace
Write-log -Subtext "| Excluded Libs:                $($LibstoExclude -join ',')" -Path $configLogging -Type Info
Write-log -Subtext "| Plex Url:                     $($PlexUrl[0..10] -join '')****" -Path $configLogging -Type Info
Write-log -Subtext "Prerequisites Part" -Path $configLogging -Type Trace
Write-log -Subtext "| Asset Path:                   $AssetPath" -Path $configLogging -Type Info
Write-log -Subtext "| Script Root:                  $global:ScriptRoot" -Path $configLogging -Type Info
Write-log -Subtext "| Magick Location:              $magickinstalllocation" -Path $configLogging -Type Info
Write-log -Subtext "| Used Poster Font:             $font" -Path $configLogging -Type Info
Write-log -Subtext "| Used Background Font:         $backgroundfont" -Path $configLogging -Type Info
Write-log -Subtext "| Used TitleCard Font:          $titlecardfont" -Path $configLogging -Type Info
Write-log -Subtext "| Used Poster Overlay File:     $Posteroverlay" -Path $configLogging -Type Info
Write-log -Subtext "| Used Background Overlay File: $Backgroundoverlay" -Path $configLogging -Type Info
Write-log -Subtext "| Used TitleCard Overlay File:  $titlecardoverlay" -Path $configLogging -Type Info
Write-log -Subtext "| Create Library Folders:       $LibraryFolders" -Path $configLogging -Type Info
Write-log -Subtext "| Create Season Posters:        $global:SeasonPosters" -Path $configLogging -Type Info
Write-log -Subtext "| Create Background Posters:    $global:BackgroundPosters" -Path $configLogging -Type Info
Write-log -Subtext "| Create Title Cards:           $global:TitleCards" -Path $configLogging -Type Info
Write-log -Subtext "OverLay General Part" -Path $configLogging -Type Trace
Write-log -Subtext "| Process Images:               $global:ImageProcessing" -Path $configLogging -Type Info
Write-log -Subtext "OverLay Poster Part" -Path $configLogging -Type Trace
Write-log -Subtext "| All Caps on Text:             $fontAllCaps" -Path $configLogging -Type Info
Write-log -Subtext "| Add Border to Image:          $AddBorder" -Path $configLogging -Type Info
Write-log -Subtext "| Add Text to Image:            $AddText" -Path $configLogging -Type Info
Write-log -Subtext "| Add Overlay to Image:         $AddOverlay" -Path $configLogging -Type Info
Write-log -Subtext "| Font Color:                   $fontcolor" -Path $configLogging -Type Info
Write-log -Subtext "| Border Color:                 $bordercolor" -Path $configLogging -Type Info
Write-log -Subtext "| Min Font Size:                $minPointSize" -Path $configLogging -Type Info
Write-log -Subtext "| Max Font Size:                $maxPointSize" -Path $configLogging -Type Info
Write-log -Subtext "| Border Width:                 $borderwidth" -Path $configLogging -Type Info
Write-log -Subtext "| Text Box Width:               $MaxWidth" -Path $configLogging -Type Info
Write-log -Subtext "| Text Box Height:              $MaxHeight" -Path $configLogging -Type Info
Write-log -Subtext "| Text Box Offset:              $text_offset" -Path $configLogging -Type Info
Write-log -Subtext "OverLay Background Part" -Path $configLogging -Type Trace
Write-log -Subtext "| All Caps on Text:             $BackgroundfontAllCaps" -Path $configLogging -Type Info
Write-log -Subtext "| Add Border to Background:     $AddBackgroundBorder" -Path $configLogging -Type Info
Write-log -Subtext "| Add Text to Background:       $AddBackgroundText" -Path $configLogging -Type Info
Write-log -Subtext "| Add Overlay to Background:    $AddBackgroundOverlay" -Path $configLogging -Type Info
Write-log -Subtext "| Font Color:                   $Backgroundfontcolor" -Path $configLogging -Type Info
Write-log -Subtext "| Border Color:                 $Backgroundbordercolor" -Path $configLogging -Type Info
Write-log -Subtext "| Min Font Size:                $BackgroundminPointSize" -Path $configLogging -Type Info
Write-log -Subtext "| Max Font Size:                $BackgroundmaxPointSize" -Path $configLogging -Type Info
Write-log -Subtext "| Border Width:                 $Backgroundborderwidth" -Path $configLogging -Type Info
Write-log -Subtext "| Text Box Width:               $BackgroundMaxWidth" -Path $configLogging -Type Info
Write-log -Subtext "| Text Box Height:              $BackgroundMaxHeight" -Path $configLogging -Type Info
Write-log -Subtext "| Text Box Offset:              $Backgroundtext_offset" -Path $configLogging -Type Info
Write-log -Subtext "OverLay TitleCard Part" -Path $configLogging -Type Trace
Write-log -Subtext "| Add Border to Background:     $AddTitleCardBorder" -Path $configLogging -Type Info
Write-log -Subtext "| Border Color:                 $TitleCardbordercolor" -Path $configLogging -Type Info
Write-log -Subtext "| Add Overlay to Background:    $AddTitleCardOverlay" -Path $configLogging -Type Info
Write-log -Subtext "| Border Width:                 $TitleCardborderwidth" -Path $configLogging -Type Info
Write-log -Subtext "OverLay TitleCard Title Part" -Path $configLogging -Type Trace
Write-log -Subtext "| All Caps on Text:             $TitleCardEPTitlefontAllCaps" -Path $configLogging -Type Info
Write-log -Subtext "| Add Title to TitleCard:       $AddTitleCardEPTitleText" -Path $configLogging -Type Info
Write-log -Subtext "| Font Color:                   $TitleCardEPTitlefontcolor" -Path $configLogging -Type Info
Write-log -Subtext "| Min Font Size:                $TitleCardEPTitleminPointSize" -Path $configLogging -Type Info
Write-log -Subtext "| Max Font Size:                $TitleCardEPTitlemaxPointSize" -Path $configLogging -Type Info
Write-log -Subtext "| Text Box Width:               $TitleCardEPTitleMaxWidth" -Path $configLogging -Type Info
Write-log -Subtext "| Text Box Height:              $TitleCardEPTitleMaxHeight" -Path $configLogging -Type Info
Write-log -Subtext "| Text Box Offset:              $TitleCardEPTitletext_offset" -Path $configLogging -Type Info
Write-log -Subtext "OverLay TitleCard EP Part" -Path $configLogging -Type Trace
Write-log -Subtext "| All Caps on Text:             $TitleCardEPfontAllCaps" -Path $configLogging -Type Info
Write-log -Subtext "| Add Episode to TitleCard:     $AddTitleCardEPText" -Path $configLogging -Type Info
Write-log -Subtext "| Font Color:                   $TitleCardEPfontcolor" -Path $configLogging -Type Info
Write-log -Subtext "| Min Font Size:                $TitleCardEPminPointSize" -Path $configLogging -Type Info
Write-log -Subtext "| Max Font Size:                $TitleCardEPmaxPointSize" -Path $configLogging -Type Info
Write-log -Subtext "| Text Box Width:               $TitleCardEPMaxWidth" -Path $configLogging -Type Info
Write-log -Subtext "| Text Box Height:              $TitleCardEPMaxHeight" -Path $configLogging -Type Info
Write-log -Subtext "| Text Box Offset:              $TitleCardEPtext_offset" -Path $configLogging -Type Info
Write-log -Subtext "___________________________________________" -Path $configLogging -Type Debug
Write-log -Message "Starting main Script now..." -Path $configLogging -Type Success    

# Get files in script root with specified extensions
$files = Get-ChildItem -Path $global:ScriptRoot -File | Where-Object { $_.Extension -in $fileExtensions } -ErrorAction SilentlyContinue

# Copy files to the destination directory
foreach ($file in $files) {
    $destinationPath = Join-Path -Path $global:ScriptRoot\temp -ChildPath $file.Name
    if (!(Test-Path -LiteralPath $destinationPath)) {
        Copy-Item -Path $file.FullName -Destination $destinationPath -Force | out-null
        Write-log -Subtext "Found File: '$($file.Name)' in ScriptRoot - copy it into temp folder..." -Path $configLogging -Type Trace
    }
}

# Load the System.Drawing.Common assembly
Add-Type -AssemblyName System.Drawing
$Posteroverlaydimensions = ([System.Drawing.Image]::FromFile($Posteroverlay)).Width.ToString() + "x" + ([System.Drawing.Image]::FromFile($Posteroverlay)).Height.ToString()
$Backgroundoverlaydimensions = ([System.Drawing.Image]::FromFile($Backgroundoverlay)).Width.ToString() + "x" + ([System.Drawing.Image]::FromFile($Backgroundoverlay)).Height.ToString()
$titlecardoverlaydimensions = ([System.Drawing.Image]::FromFile($titlecardoverlay)).Width.ToString() + "x" + ([System.Drawing.Image]::FromFile($titlecardoverlay)).Height.ToString()

# Check Poster Overlay Size:
if ($Posteroverlaydimensions -eq $PosterSize) {
    Write-log -Subtext "Poster overlay is correctly sized at: $Postersize" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Success
}else{
    Write-log -Subtext "Poster overlay is NOT correctly sized at: $Postersize. Actual dimensions: $Posteroverlaydimensions" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Warning
}
# Check Background Overlay Size:
if ($Backgroundoverlaydimensions -eq $BackgroundSize) {
    Write-log -Subtext "Background overlay is correctly sized at: $BackgroundSize" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Success
}else{
    Write-log -Subtext "Background overlay is NOT correctly sized at: $BackgroundSize. Actual dimensions: $Backgroundoverlaydimensions" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Warning
}
# Check TitleCard Overlay Size:
if ($titlecardoverlaydimensions -eq $BackgroundSize) {
    Write-log -Subtext "TitleCard overlay is correctly sized at: $BackgroundSize" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Success
}else{
    Write-log -Subtext "TitleCard overlay is NOT correctly sized at: $BackgroundSize. Actual dimensions: $titlecardoverlaydimensions" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Warning
}

# Check Plex now:
if ($PlexToken) {
    Write-log -Message "Plex token found, checking access now..." -Path $configLogging -Type Info
    if ((Invoke-WebRequest "$PlexUrl/?X-Plex-Token=$PlexToken").StatusCode -eq 200) {
        Write-log -Subtext "Plex access is working..." -Path $configLogging -Type Success
        [xml]$Libs = (Invoke-WebRequest "$PlexUrl/library/sections/?X-Plex-Token=$PlexToken").content
    }
    Else {
        Write-log -Message "Could not access plex with this url: $PlexUrl/?X-Plex-Token=$PlexToken" -Path $configLogging -Type Error
        Write-log -Subtext "Please check token and access..." -Path $configLogging -Type Error
        $Errorcount++
        pause
        exit
    }
}
Else {
    Write-log -Message "Checking Plex access now..." -Path $configLogging -Type Info
    if ((Invoke-WebRequest "$PlexUrl").StatusCode -eq 200) {
        Write-log -Subtext "Plex access is working..." -Path $configLogging -Type Success
        [xml]$Libs = (Invoke-WebRequest "$PlexUrl/library/sections").content
    }
    Else {
        Write-log -Message "Could not access plex with this url: $PlexUrl" -Path $configLogging -Type Error
        $Errorcount++
        Write-log -Subtext "Please check access and settings in plex..." -Path $configLogging -Type Error
        Write-log -Message "To be able to connect to plex without Auth" -Path $configLogging -Type Info
        Write-log -Message "You have to enter your ip range in 'Settings -> Network -> List of IP addresses and networks that are allowed without auth: '192.168.1.0/255.255.255.0''" -Path $configLogging -Type Info
        pause
        exit
    }
}

if (!(Test-Path $magick)) {
    Write-log -Message "ImageMagick missing, downloading/installing it for you..." -Path $configLogging -Type Error
    $Errorcount++
    $InstallArguments = "/verysilent /DIR=`"$magickinstalllocation`""
    $result = Invoke-WebRequest "https://imagemagick.org/archive/binaries/?C=M;O=D"
    $LatestRelease = ($result.links | Where-Object href -like '*Q16-HDRI-x64-dll.exe' | Sort-Object)[0].href
    Invoke-WebRequest "https://imagemagick.org/archive/binaries/$LatestRelease" -OutFile $global:ScriptRoot\temp\$LatestRelease
    Start-Process $global:ScriptRoot\temp\$LatestRelease -ArgumentList $InstallArguments -NoNewWindow -Wait
    if (Test-Path -LiteralPath $magickinstalllocation\magick.exe) {
        Write-log -Subtext "ImageMagick installed here: $magickinstalllocation" -Path $configLogging -Type Success
    }
    Else {
        Write-log -Subtext "Error During installation, please manually install Imagemagick" -Path $configLogging -Type Error
    }
}
# check if fanart Module is installed
if (!(Get-InstalledModule -Name FanartTvAPI)) {
    Write-log -Message "FanartTvAPI Module missing, installing it for you..." -Path $configLogging -Type Error
    $Errorcount++
    Install-Module -Name FanartTvAPI -Force -Confirm -AllowClobber
    
    Write-log -Subtext "FanartTvAPI Module installed, importing it now..." -Path $configLogging -Type Success
    Import-Module -Name FanartTvAPI
}
# Add Fanart Api
Add-FanartTvAPIKey -Api_Key $FanartTvAPIKey

# Check TMDB Token before building the Header.
if ($global:tmdbtoken.Length -le '35') {
    Write-log -Message "TMDB Token is to short, you may have used Api key in config file, please change it to 'API Read Access Token'." -Path $configLogging -Type Error
    pause
    exit
}

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
        $PosterImageoriginal = "$AssetPath\$LibraryName\$FolderName\poster.jpg"
        if ($CreateSeasonPoster -eq 'y') {
            $SeasonPosterName = Read-Host "Enter Season Name"
            if ($SeasonPosterName -match 'Season\s+(\d+)') {
                $global:SeasonNumber = $Matches[1]
                $global:season = "Season" + $global:SeasonNumber.PadLeft(2, '0')
            }
            if ($SeasonPosterName -eq 'Specials') {
                $global:season = "Season00"
            }  
            $PosterImageoriginal = "$AssetPath\$LibraryName\$FolderName\$global:season.jpg"
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
            $PosterImageoriginal = "$AssetPath\$($FolderName)_$global:season.jpg"
        }
    }

    $PosterImage = "$global:ScriptRoot\temp\$FolderName.jpg"
    $PosterImage = $PosterImage.Replace('[', '_').Replace(']', '_').Replace('{', '_').Replace('}', '_')
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
        Move-Item -LiteralPath $PicturePath -destination $PosterImage -Force -ErrorAction SilentlyContinue
        Write-log -Subtext "Processing Poster for: `"$joinedTitle`"" -Path $global:ScriptRoot\Logs\Manuallog.log -Type Info

        # Resize Image to 2000x3000 and apply Border and overlay
        if ($AddBorder -eq 'true' -and $AddOverlay -eq 'true') {
            $Arguments = "`"$PosterImage`" -resize `"$PosterSize^`" -gravity center -extent `"$PosterSize`" `"$Posteroverlay`" -gravity south -composite -shave `"$borderwidthsecond`"  -bordercolor `"$bordercolor`" -border `"$borderwidth`" `"$PosterImage`""
            Write-log -Subtext "Resizing it | Adding Borders | Adding Overlay" -Path $global:ScriptRoot\Logs\Manuallog.log -Type Info
        }
        if ($AddBorder -eq 'true' -and $AddOverlay -eq 'false') {
            $Arguments = "`"$PosterImage`" -resize `"$PosterSize^`" -gravity center -extent `"$PosterSize`" -shave `"$borderwidthsecond`"  -bordercolor `"$bordercolor`" -border `"$borderwidth`" `"$PosterImage`""
            Write-log -Subtext "Resizing it | Adding Borders" -Path $global:ScriptRoot\Logs\Manuallog.log -Type Info
        }
        if ($AddBorder -eq 'false' -and $AddOverlay -eq 'true') {
            $Arguments = "`"$PosterImage`" -resize `"$PosterSize^`" -gravity center -extent `"$PosterSize`" `"$Posteroverlay`" -gravity south -composite `"$PosterImage`""
            Write-log -Subtext "Resizing it | Adding Overlay" -Path $global:ScriptRoot\Logs\Manuallog.log -Type Info
        }
        if ($AddBorder -eq 'false' -and $AddOverlay -eq 'false') {
            $Arguments = "`"$PosterImage`" -resize `"$PosterSize^`" -gravity center -extent `"$PosterSize`" `"$PosterImage`""
            Write-log -Subtext "Resizing it" -Path $global:ScriptRoot\Logs\Manuallog.log -Type Info
        }

        $logEntry = "magick.exe $Arguments"
        $logEntry | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append 
        Start-Process $magick -Wait -NoNewWindow -ArgumentList $Arguments

        if ($AddText -eq 'true') {
            $optimalFontSize = Get-OptimalPointSize -text $joinedTitle -font $fontImagemagick -box_width $MaxWidth  -box_height $MaxHeight -min_pointsize $minPointSize -max_pointsize $maxPointSize
            Write-log -Subtext "Optimal font size set to: '$optimalFontSize'" -Path $global:ScriptRoot\Logs\Manuallog.log -Type Info
            $Arguments = "`"$PosterImage`" -gravity center -background None -layers Flatten `( -font `"$fontImagemagick`" -pointsize `"$optimalFontSize`" -fill `"$fontcolor`" -size `"$boxsize`" -background none caption:`"$joinedTitle`" -trim -gravity south -extent `"$boxsize`" `) -gravity south -geometry +0`"$text_offset`" -composite `"$PosterImage`""
            Write-log -Subtext "    Applying Poster text: `"$joinedTitle`"" -Path $global:ScriptRoot\Logs\Manuallog.log -Type Info
            $logEntry = "magick.exe $Arguments"
            $logEntry | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append 
            Start-Process $magick -Wait -NoNewWindow -ArgumentList $Arguments
        }
    }
    Else {
        # Resize Image to 2000x3000
        $Resizeargument = "`"$PosterImage`" -resize `"$PosterSize^`" -gravity center -extent `"$PosterSize`" `"$PosterImage`""
        Write-log -Subtext "Resizing it... " -Path $global:ScriptRoot\Logs\Manuallog.log -Type Info
        $logEntry = "magick.exe $Resizeargument"
        $logEntry | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append 
        Start-Process $magick -Wait -NoNewWindow -ArgumentList $Resizeargument
    }
    # Move file back to original naming with Brackets.
    Move-Item -LiteralPath $PosterImage -destination $PosterImageoriginal -Force -ErrorAction SilentlyContinue
    Write-log -Subtext "Poster created and moved to: $PosterImageoriginal" -Path $global:ScriptRoot\Logs\Manuallog.log -Type Success
}
Elseif ($Testing) {
    Write-log -Message "Poster Testing Started" -Path $global:ScriptRoot\Logs\Testinglog.log -Type Debug
    Write-log -Subtext "I will now create a few posters for you with different text lengths using your current configuration settings." -Path $global:ScriptRoot\Logs\Testinglog.log -Type Warning
    # Poster Part
    if (!(Test-Path $testimage)) {
        $ArgumentCreate = "-size `"$PosterSize`" xc:pink -background none `"$testimage`""
        $logEntryCreate = "magick.exe $ArgumentCreate"
        $logEntryCreate | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append 
        Start-Process $magick -Wait -NoNewWindow -ArgumentList $ArgumentCreate
        Write-log -Subtext "Test Poster Created..." -Path $global:ScriptRoot\Logs\Testinglog.log -Type Trace
    }
    if (!(Test-Path $backgroundtestimage)) {
        $backgroundArgumentCreate = "-size `"$BackgroundSize`" xc:pink -background none `"$backgroundtestimage`""
        $backgroundlogEntryCreate = "magick.exe $backgroundArgumentCreate"
        $backgroundlogEntryCreate | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append 
        Start-Process $magick -Wait -NoNewWindow -ArgumentList $backgroundArgumentCreate
        Write-log -Subtext "Test background Created..." -Path $global:ScriptRoot\Logs\Testinglog.log -Type Trace
    }
    $ShortText = "The Hobbit" 
    $MediumText = "The Hobbit is a great movie" 
    $LongText = "The Hobbit is a great movie that we all loved and enjoyed watching" 
    $bullet = [char]0x2022
    $Episodetext = "Season 1 $bullet Episode 1"

    $ShortTextCAPS = $ShortText.ToUpper()
    $MediumTextCAPS = $MediumText.ToUpper()
    $LongTextCAPS = $LongText.ToUpper()
    $EpisodetextCAPS = $Episodetext.ToUpper()
    # Posters
    $TestPosterShort = "$global:ScriptRoot\test\ShortText.jpg"
    $TestPosterMedium = "$global:ScriptRoot\test\MediumText.jpg"
    $TestPosterLong = "$global:ScriptRoot\test\LongText.jpg"
    $TestPosterShortCAPS = "$global:ScriptRoot\test\ShortTextCAPS.jpg"
    $TestPosterMediumCAPS = "$global:ScriptRoot\test\MediumTextCAPS.jpg"
    $TestPosterLongCAPS = "$global:ScriptRoot\test\LongTextCAPS.jpg"
    # Backgrounds
    $backgroundTestPosterShort = "$global:ScriptRoot\test\backgroundShortText.jpg"
    $backgroundTestPosterMedium = "$global:ScriptRoot\test\backgroundMediumText.jpg"
    $backgroundTestPosterLong = "$global:ScriptRoot\test\backgroundLongText.jpg"
    $backgroundTestPosterShortCAPS = "$global:ScriptRoot\test\backgroundShortTextCAPS.jpg"
    $backgroundTestPosterMediumCAPS = "$global:ScriptRoot\test\backgroundMediumTextCAPS.jpg"
    $backgroundTestPosterLongCAPS = "$global:ScriptRoot\test\backgroundLongTextCAPS.jpg"
    # TitleCards
    $TitleCardTestPosterShort = "$global:ScriptRoot\test\TitleCardShortText.jpg"
    $TitleCardTestPosterMedium = "$global:ScriptRoot\test\TitleCardMediumText.jpg"
    $TitleCardTestPosterLong = "$global:ScriptRoot\test\TitleCardLongText.jpg"
    $TitleCardTestPosterShortCAPS = "$global:ScriptRoot\test\TitleCardShortTextCAPS.jpg"
    $TitleCardTestPosterMediumCAPS = "$global:ScriptRoot\test\TitleCardMediumTextCAPS.jpg"
    $TitleCardTestPosterLongCAPS = "$global:ScriptRoot\test\TitleCardLongTextCAPS.jpg"

    # Optimal Poster Font Size
    $optimalFontSizeShort = Get-OptimalPointSize -text $ShortText -font $fontImagemagick -box_width $MaxWidth  -box_height $MaxHeight -min_pointsize $minPointSize -max_pointsize $maxPointSize
    $optimalFontSizeMedium = Get-OptimalPointSize -text $MediumText -font $fontImagemagick -box_width $MaxWidth  -box_height $MaxHeight -min_pointsize $minPointSize -max_pointsize $maxPointSize
    $optimalFontSizeLong = Get-OptimalPointSize -text $LongText -font $fontImagemagick -box_width $MaxWidth  -box_height $MaxHeight -min_pointsize $minPointSize -max_pointsize $maxPointSize
    
    $optimalFontSizeShortCAPS = Get-OptimalPointSize -text $ShortTextCAPS -font $fontImagemagick -box_width $MaxWidth  -box_height $MaxHeight -min_pointsize $minPointSize -max_pointsize $maxPointSize
    $optimalFontSizeMediumCAPS = Get-OptimalPointSize -text $MediumTextCAPS -font $fontImagemagick -box_width $MaxWidth  -box_height $MaxHeight -min_pointsize $minPointSize -max_pointsize $maxPointSize
    $optimalFontSizeLongCAPS = Get-OptimalPointSize -text $LongTextCAPS -font $fontImagemagick -box_width $MaxWidth  -box_height $MaxHeight -min_pointsize $minPointSize -max_pointsize $maxPointSize
    
    # Optimal Background Font Size
    $backgroundoptimalFontSizeShort = Get-OptimalPointSize -text $ShortText -font $backgroundfontImagemagick -box_width $BackgroundMaxWidth  -box_height $BackgroundMaxHeight -min_pointsize $BackgroundminPointSize -max_pointsize $BackgroundmaxPointSize
    $backgroundoptimalFontSizeMedium = Get-OptimalPointSize -text $MediumText -font $backgroundfontImagemagick -box_width $BackgroundMaxWidth  -box_height $BackgroundMaxHeight -min_pointsize $BackgroundminPointSize -max_pointsize $BackgroundmaxPointSize
    $backgroundoptimalFontSizeLong = Get-OptimalPointSize -text $LongText -font $backgroundfontImagemagick -box_width $BackgroundMaxWidth  -box_height $BackgroundMaxHeight -min_pointsize $BackgroundminPointSize -max_pointsize $BackgroundmaxPointSize
    
    $backgroundoptimalFontSizeShortCAPS = Get-OptimalPointSize -text $ShortTextCAPS -font $backgroundfontImagemagick -box_width $BackgroundMaxWidth  -box_height $BackgroundMaxHeight -min_pointsize $BackgroundminPointSize -max_pointsize $BackgroundmaxPointSize
    $backgroundoptimalFontSizeMediumCAPS = Get-OptimalPointSize -text $MediumTextCAPS -font $backgroundfontImagemagick -box_width $BackgroundMaxWidth  -box_height $BackgroundMaxHeight -min_pointsize $BackgroundminPointSize -max_pointsize $BackgroundmaxPointSize
    $backgroundoptimalFontSizeLongCAPS = Get-OptimalPointSize -text $LongTextCAPS -font $backgroundfontImagemagick -box_width $BackgroundMaxWidth  -box_height $BackgroundMaxHeight -min_pointsize $BackgroundminPointSize -max_pointsize $BackgroundmaxPointSize
    
    # Optimal TitleCard Font Size
    $TitleCardoptimalFontSizeShort = Get-OptimalPointSize -text $ShortText -font $titlecardfontImagemagick -box_width $TitleCardEPTitleMaxWidth  -box_height $TitleCardEPTitleMaxHeight -min_pointsize $TitleCardEPTitleminPointSize -max_pointsize $TitleCardEPTitlemaxPointSize
    $TitleCardoptimalFontSizeMedium = Get-OptimalPointSize -text $MediumText -font $titlecardfontImagemagick -box_width $TitleCardEPTitleMaxWidth  -box_height $TitleCardEPTitleMaxHeight -min_pointsize $TitleCardEPTitleminPointSize -max_pointsize $TitleCardEPTitlemaxPointSize
    $TitleCardoptimalFontSizeLong = Get-OptimalPointSize -text $LongText -font $titlecardfontImagemagick -box_width $TitleCardEPTitleMaxWidth  -box_height $TitleCardEPTitleMaxHeight -min_pointsize $TitleCardEPTitleminPointSize -max_pointsize $TitleCardEPTitlemaxPointSize
    $TitleCardoptimalFontSizeEpisodetext = Get-OptimalPointSize -text $Episodetext -font $titlecardfontImagemagick -box_width $TitleCardEPMaxWidth  -box_height $TitleCardEPMaxHeight -min_pointsize $TitleCardEPminPointSize -max_pointsize $TitleCardEPmaxPointSize    
        
    $TitleCardoptimalFontSizeShortCAPS = Get-OptimalPointSize -text $ShortTextCAPS -font $titlecardfontImagemagick -box_width $TitleCardEPTitleMaxWidth  -box_height $TitleCardEPTitleMaxHeight -min_pointsize $TitleCardEPTitleminPointSize -max_pointsize $TitleCardEPTitlemaxPointSize
    $TitleCardoptimalFontSizeMediumCAPS = Get-OptimalPointSize -text $MediumTextCAPS -font $titlecardfontImagemagick -box_width $TitleCardEPTitleMaxWidth  -box_height $TitleCardEPTitleMaxHeight -min_pointsize $TitleCardEPTitleminPointSize -max_pointsize $TitleCardEPTitlemaxPointSize
    $TitleCardoptimalFontSizeLongCAPS = Get-OptimalPointSize -text $LongTextCAPS -font $titlecardfontImagemagick -box_width $TitleCardEPTitleMaxWidth  -box_height $TitleCardEPTitleMaxHeight -min_pointsize $TitleCardEPTitleminPointSize -max_pointsize $TitleCardEPTitlemaxPointSize
    $TitleCardoptimalFontSizeEpisodetextCAPS = Get-OptimalPointSize -text $EpisodetextCAPS -font $titlecardfontImagemagick -box_width $TitleCardEPMaxWidth  -box_height $TitleCardEPMaxHeight -min_pointsize $TitleCardEPminPointSize -max_pointsize $TitleCardEPmaxPointSize    

    # Border/Overlay Poster Part
    Write-log -Subtext "Poster Part:" -Path $global:ScriptRoot\Logs\Testinglog.log -Type Success
    if ($AddBorder -eq 'true' -and $AddOverlay -eq 'true') {
        $ArgumentsShort = "`"$testimage`" `"$Posteroverlay`" -gravity south -composite -shave `"$borderwidthsecond`"  -bordercolor `"$bordercolor`" -border `"$borderwidth`" `"$TestPosterShort`""
        $ArgumentsMedium = "`"$testimage`" `"$Posteroverlay`" -gravity south -composite -shave `"$borderwidthsecond`"  -bordercolor `"$bordercolor`" -border `"$borderwidth`" `"$TestPosterMedium`""
        $ArgumentsLong = "`"$testimage`" `"$Posteroverlay`" -gravity south -composite -shave `"$borderwidthsecond`"  -bordercolor `"$bordercolor`" -border `"$borderwidth`" `"$TestPosterLong`""
        $ArgumentsShortCAPS = "`"$testimage`" `"$Posteroverlay`" -gravity south -composite -shave `"$borderwidthsecond`"  -bordercolor `"$bordercolor`" -border `"$borderwidth`" `"$TestPosterShortCAPS`""
        $ArgumentsMediumCAPS = "`"$testimage`" `"$Posteroverlay`" -gravity south -composite -shave `"$borderwidthsecond`"  -bordercolor `"$bordercolor`" -border `"$borderwidth`" `"$TestPosterMediumCAPS`""
        $ArgumentsLongCAPS = "`"$testimage`" `"$Posteroverlay`" -gravity south -composite -shave `"$borderwidthsecond`"  -bordercolor `"$bordercolor`" -border `"$borderwidth`" `"$TestPosterLongCAPS`""
        Write-log -Subtext "Adding Poster Borders | Adding Poster Overlay" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
    }
    if ($AddBorder -eq 'true' -and $AddOverlay -eq 'false') {
        $ArgumentsShort = "`"$testimage`" -shave `"$borderwidthsecond`"  -bordercolor `"$bordercolor`" -border `"$borderwidth`" `"$TestPosterShort`""
        $ArgumentsMedium = "`"$testimage`" -shave `"$borderwidthsecond`"  -bordercolor `"$bordercolor`" -border `"$borderwidth`" `"$TestPosterMedium`""
        $ArgumentsLong = "`"$testimage`" -shave `"$borderwidthsecond`"  -bordercolor `"$bordercolor`" -border `"$borderwidth`" `"$TestPosterLong`""
        $ArgumentsShortCAPS = "`"$testimage`" -shave `"$borderwidthsecond`"  -bordercolor `"$bordercolor`" -border `"$borderwidth`" `"$TestPosterShortCAPS`""
        $ArgumentsMediumCAPS = "`"$testimage`" -shave `"$borderwidthsecond`"  -bordercolor `"$bordercolor`" -border `"$borderwidth`" `"$TestPosterMediumCAPS`""
        $ArgumentsLongCAPS = "`"$testimage`" -shave `"$borderwidthsecond`"  -bordercolor `"$bordercolor`" -border `"$borderwidth`" `"$TestPosterLongCAPS`""
        Write-log -Subtext "Adding Poster Borders" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
    }
    if ($AddBorder -eq 'false' -and $AddOverlay -eq 'true') {
        $ArgumentsShort = "`"$testimage`" `"$Posteroverlay`" -gravity south -composite `"$TestPosterShort`""
        $ArgumentsMedium = "`"$testimage`" `"$Posteroverlay`" -gravity south -composite `"$TestPosterMedium`""
        $ArgumentsLong = "`"$testimage`" `"$Posteroverlay`" -gravity south -composite `"$TestPosterLong`""
        $ArgumentsShortCAPS = "`"$testimage`" `"$Posteroverlay`" -gravity south -composite `"$TestPosterShortCAPS`""
        $ArgumentsMediumCAPS = "`"$testimage`" `"$Posteroverlay`" -gravity south -composite `"$TestPosterMediumCAPS`""
        $ArgumentsLongCAPS = "`"$testimage`" `"$Posteroverlay`" -gravity south -composite `"$TestPosterLongCAPS`""
        Write-log -Subtext "Adding Poster Overlay" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
    }

    # Poster Logging
    $logEntryShort = "magick.exe $ArgumentsShort"
    $logEntryMedium = "magick.exe $ArgumentsMedium"
    $logEntryLong = "magick.exe $ArgumentsLong"
    $logEntryShortCAPS = "magick.exe $ArgumentsShortCAPS"
    $logEntryMediumCAPS = "magick.exe $ArgumentsMediumCAPS"
    $logEntryLongCAPS = "magick.exe $ArgumentsLongCAPS"

    $logEntryShort | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append 
    $logEntryShortCAPS | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append 
    $logEntryMedium | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append 
    $logEntryMediumCAPS | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append 
    $logEntryLong | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append 
    $logEntryLongCAPS | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append 

    # Test Poster creation
    Start-Process $magick -Wait -NoNewWindow -ArgumentList $ArgumentsShort
    Start-Process $magick -Wait -NoNewWindow -ArgumentList $ArgumentsMedium
    Start-Process $magick -Wait -NoNewWindow -ArgumentList $ArgumentsLong
    Start-Process $magick -Wait -NoNewWindow -ArgumentList $ArgumentsShortCAPS
    Start-Process $magick -Wait -NoNewWindow -ArgumentList $ArgumentsMediumCAPS
    Start-Process $magick -Wait -NoNewWindow -ArgumentList $ArgumentsLongCAPS

    # Logging Poster
    Write-log -Subtext "Optimal font size for Short text is: '$optimalFontSizeShort'" -Path $global:ScriptRoot\Logs\Testinglog.log -Type Info
    Write-log -Subtext "    Applying text: `"$ShortText`"" -Path $global:ScriptRoot\Logs\Testinglog.log -Type Info
    Write-log -Subtext "Optimal font size for Medium text is: '$optimalFontSizeMedium'" -Path $global:ScriptRoot\Logs\Testinglog.log -Type Info
    Write-log -Subtext "    Applying text: `"$MediumText`"" -Path $global:ScriptRoot\Logs\Testinglog.log -Type Info
    Write-log -Subtext "Optimal font size for Long text is: '$optimalFontSizeLong'" -Path $global:ScriptRoot\Logs\Testinglog.log -Type Info
    Write-log -Subtext "    Applying text: `"$LongText`"" -Path $global:ScriptRoot\Logs\Testinglog.log -Type Info
    
    Write-log -Subtext "Optimal font size for Short CAPS text is: '$optimalFontSizeShortCAPS'" -Path $global:ScriptRoot\Logs\Testinglog.log -Type Info
    Write-log -Subtext "    Applying CAPS text: `"$ShortTextCAPS`"" -Path $global:ScriptRoot\Logs\Testinglog.log -Type Info
    Write-log -Subtext "Optimal font size for Medium CAPS text is: '$optimalFontSizeMediumCAPS'" -Path $global:ScriptRoot\Logs\Testinglog.log -Type Info
    Write-log -Subtext "    Applying CAPS text: `"$MediumTextCAPS`"" -Path $global:ScriptRoot\Logs\Testinglog.log -Type Info
    Write-log -Subtext "Optimal font size for Long CAPS text is: '$optimalFontSizeLongCAPS'" -Path $global:ScriptRoot\Logs\Testinglog.log -Type Info
    Write-log -Subtext "    Applying CAPS text: `"$LongTextCAPS`"" -Path $global:ScriptRoot\Logs\Testinglog.log -Type Info
    
    Write-log -Subtext "Background Part:" -Path $global:ScriptRoot\Logs\Testinglog.log -Type Success
    # Border/Overlay Background Part
    if ($AddBackgroundBorder -eq 'true' -and $AddBackgroundOverlay -eq 'true') {
        $backgroundArgumentsShort = "`"$backgroundtestimage`" `"$Backgroundoverlay`" -gravity south -composite -shave `"$Backgroundborderwidthsecond`"  -bordercolor `"$Backgroundbordercolor`" -border `"$Backgroundborderwidth`" `"$backgroundTestPosterShort`""
        $backgroundArgumentsMedium = "`"$backgroundtestimage`" `"$Backgroundoverlay`" -gravity south -composite -shave `"$Backgroundborderwidthsecond`"  -bordercolor `"$Backgroundbordercolor`" -border `"$Backgroundborderwidth`" `"$backgroundTestPosterMedium`""
        $backgroundArgumentsLong = "`"$backgroundtestimage`" `"$Backgroundoverlay`" -gravity south -composite -shave `"$Backgroundborderwidthsecond`"  -bordercolor `"$Backgroundbordercolor`" -border `"$Backgroundborderwidth`" `"$backgroundTestPosterLong`""
        $backgroundArgumentsShortCAPS = "`"$backgroundtestimage`" `"$Backgroundoverlay`" -gravity south -composite -shave `"$Backgroundborderwidthsecond`"  -bordercolor `"$Backgroundbordercolor`" -border `"$Backgroundborderwidth`" `"$backgroundTestPosterShortCAPS`""
        $backgroundArgumentsMediumCAPS = "`"$backgroundtestimage`" `"$Backgroundoverlay`" -gravity south -composite -shave `"$Backgroundborderwidthsecond`"  -bordercolor `"$Backgroundbordercolor`" -border `"$Backgroundborderwidth`" `"$backgroundTestPosterMediumCAPS`""
        $backgroundArgumentsLongCAPS = "`"$backgroundtestimage`" `"$Backgroundoverlay`" -gravity south -composite -shave `"$Backgroundborderwidthsecond`"  -bordercolor `"$Backgroundbordercolor`" -border `"$Backgroundborderwidth`" `"$backgroundTestPosterLongCAPS`""
        Write-log -Subtext "Adding Background Borders | Adding Background Overlay" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
    }
    if ($AddBackgroundBorder -eq 'true' -and $AddBackgroundOverlay -eq 'false') {
        $backgroundArgumentsShort = "`"$backgroundtestimage`" -shave `"$Backgroundborderwidthsecond`"  -bordercolor `"$Backgroundbordercolor`" -border `"$Backgroundborderwidth`" `"$backgroundTestPosterShort`""
        $backgroundArgumentsMedium = "`"$backgroundtestimage`" -shave `"$Backgroundborderwidthsecond`"  -bordercolor `"$Backgroundbordercolor`" -border `"$Backgroundborderwidth`" `"$backgroundTestPosterMedium`""
        $backgroundArgumentsLong = "`"$backgroundtestimage`" -shave `"$Backgroundborderwidthsecond`"  -bordercolor `"$Backgroundbordercolor`" -border `"$Backgroundborderwidth`" `"$backgroundTestPosterLong`""
        $backgroundArgumentsShortCAPS = "`"$backgroundtestimage`" -shave `"$Backgroundborderwidthsecond`"  -bordercolor `"$Backgroundbordercolor`" -border `"$Backgroundborderwidth`" `"$backgroundTestPosterShortCAPS`""
        $backgroundArgumentsMediumCAPS = "`"$backgroundtestimage`" -shave `"$Backgroundborderwidthsecond`"  -bordercolor `"$Backgroundbordercolor`" -border `"$Backgroundborderwidth`" `"$backgroundTestPosterMediumCAPS`""
        $backgroundArgumentsLongCAPS = "`"$backgroundtestimage`" -shave `"$Backgroundborderwidthsecond`"  -bordercolor `"$Backgroundbordercolor`" -border `"$Backgroundborderwidth`" `"$backgroundTestPosterLongCAPS`""
        Write-log -Subtext "Adding Background Borders" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
    }
    if ($AddBackgroundBorder -eq 'false' -and $AddBackgroundOverlay -eq 'true') {
        $backgroundArgumentsShort = "`"$backgroundtestimage`" `"$Backgroundoverlay`" -gravity south -composite `"$backgroundTestPosterShort`""
        $backgroundArgumentsMedium = "`"$backgroundtestimage`" `"$Backgroundoverlay`" -gravity south -composite `"$backgroundTestPosterMedium`""
        $backgroundArgumentsLong = "`"$backgroundtestimage`" `"$Backgroundoverlay`" -gravity south -composite `"$backgroundTestPosterLong`""
        $backgroundArgumentsShortCAPS = "`"$backgroundtestimage`" `"$Backgroundoverlay`" -gravity south -composite `"$backgroundTestPosterShortCAPS`""
        $backgroundArgumentsMediumCAPS = "`"$backgroundtestimage`" `"$Backgroundoverlay`" -gravity south -composite `"$backgroundTestPosterMediumCAPS`""
        $backgroundArgumentsLongCAPS = "`"$backgroundtestimage`" `"$Backgroundoverlay`" -gravity south -composite `"$backgroundTestPosterLongCAPS`""
        Write-log -Subtext "Adding Background Overlay" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
    }
    # Background Logging
    $backgroundlogEntryShort = "magick.exe $backgroundArgumentsShort"
    $backgroundlogEntryMedium = "magick.exe $backgroundArgumentsMedium"
    $backgroundlogEntryLong = "magick.exe $backgroundArgumentsLong"
    $backgroundlogEntryShortCAPS = "magick.exe $backgroundArgumentsShortCAPS"
    $backgroundlogEntryMediumCAPS = "magick.exe $backgroundArgumentsMediumCAPS"
    $backgroundlogEntryLongCAPS = "magick.exe $backgroundArgumentsLongCAPS"

    $backgroundlogEntryShort | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append 
    $backgroundlogEntryShortCAPS | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append 
    $backgroundlogEntryMedium | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append 
    $backgroundlogEntryMediumCAPS | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append 
    $backgroundlogEntryLong | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append 
    $backgroundlogEntryLongCAPS | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append

    # Test Background creation
    Start-Process $magick -Wait -NoNewWindow -ArgumentList $backgroundArgumentsShort
    Start-Process $magick -Wait -NoNewWindow -ArgumentList $backgroundArgumentsMedium
    Start-Process $magick -Wait -NoNewWindow -ArgumentList $backgroundArgumentsLong
    Start-Process $magick -Wait -NoNewWindow -ArgumentList $backgroundArgumentsShortCAPS
    Start-Process $magick -Wait -NoNewWindow -ArgumentList $backgroundArgumentsMediumCAPS
    Start-Process $magick -Wait -NoNewWindow -ArgumentList $backgroundArgumentsLongCAPS
    
    # Logging Background
    Write-log -Subtext "Optimal font size for Short text is: '$backgroundoptimalFontSizeShort'" -Path $global:ScriptRoot\Logs\Testinglog.log -Type Info
    Write-log -Subtext "    Applying text: `"$ShortText`"" -Path $global:ScriptRoot\Logs\Testinglog.log -Type Info
    Write-log -Subtext "Optimal font size for Medium text is: '$backgroundoptimalFontSizeMedium'" -Path $global:ScriptRoot\Logs\Testinglog.log -Type Info
    Write-log -Subtext "    Applying text: `"$MediumText`"" -Path $global:ScriptRoot\Logs\Testinglog.log -Type Info
    Write-log -Subtext "Optimal font size for Long text is: '$backgroundoptimalFontSizeLong'" -Path $global:ScriptRoot\Logs\Testinglog.log -Type Info
    Write-log -Subtext "    Applying text: `"$LongText`"" -Path $global:ScriptRoot\Logs\Testinglog.log -Type Info

    Write-log -Subtext "Optimal font size for Short CAPS text is: '$backgroundoptimalFontSizeShortCAPS'" -Path $global:ScriptRoot\Logs\Testinglog.log -Type Info
    Write-log -Subtext "    Applying CAPS text: `"$ShortTextCAPS`"" -Path $global:ScriptRoot\Logs\Testinglog.log -Type Info
    Write-log -Subtext "Optimal font size for Medium CAPS text is: '$backgroundoptimalFontSizeMediumCAPS'" -Path $global:ScriptRoot\Logs\Testinglog.log -Type Info
    Write-log -Subtext "    Applying CAPS text: `"$MediumTextCAPS`"" -Path $global:ScriptRoot\Logs\Testinglog.log -Type Info
    Write-log -Subtext "Optimal font size for Long CAPS text is: '$backgroundoptimalFontSizeLongCAPS'" -Path $global:ScriptRoot\Logs\Testinglog.log -Type Info
    Write-log -Subtext "    Applying CAPS text: `"$LongTextCAPS`"" -Path $global:ScriptRoot\Logs\Testinglog.log -Type Info


    Write-log -Subtext "TitleCard Part:" -Path $global:ScriptRoot\Logs\Testinglog.log -Type Success
    # Border/Overlay TitleCard Part
    if ($Addtitlecardborder -eq 'true' -and $Addtitlecardoverlay -eq 'true') {
        $titlecardArgumentsShort = "`"$backgroundtestimage`" `"$titlecardoverlay`" -gravity south -composite -shave `"$titlecardborderwidthsecond`"  -bordercolor `"$titlecardbordercolor`" -border `"$titlecardborderwidth`" `"$titlecardtestPosterShort`""
        $titlecardArgumentsMedium = "`"$backgroundtestimage`" `"$titlecardoverlay`" -gravity south -composite -shave `"$titlecardborderwidthsecond`"  -bordercolor `"$titlecardbordercolor`" -border `"$titlecardborderwidth`" `"$titlecardtestPosterMedium`""
        $titlecardArgumentsLong = "`"$backgroundtestimage`" `"$titlecardoverlay`" -gravity south -composite -shave `"$titlecardborderwidthsecond`"  -bordercolor `"$titlecardbordercolor`" -border `"$titlecardborderwidth`" `"$titlecardtestPosterLong`""
        $titlecardArgumentsShortCAPS = "`"$backgroundtestimage`" `"$titlecardoverlay`" -gravity south -composite -shave `"$titlecardborderwidthsecond`"  -bordercolor `"$titlecardbordercolor`" -border `"$titlecardborderwidth`" `"$titlecardtestPosterShortCAPS`""
        $titlecardArgumentsMediumCAPS = "`"$backgroundtestimage`" `"$titlecardoverlay`" -gravity south -composite -shave `"$titlecardborderwidthsecond`"  -bordercolor `"$titlecardbordercolor`" -border `"$titlecardborderwidth`" `"$titlecardtestPosterMediumCAPS`""
        $titlecardArgumentsLongCAPS = "`"$backgroundtestimage`" `"$titlecardoverlay`" -gravity south -composite -shave `"$titlecardborderwidthsecond`"  -bordercolor `"$titlecardbordercolor`" -border `"$titlecardborderwidth`" `"$titlecardtestPosterLongCAPS`""
        Write-log -Subtext "Adding Background Borders | Adding Background Overlay" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
    }
    if ($Addtitlecardborder -eq 'true' -and $Addtitlecardoverlay -eq 'false') {
        $titlecardArgumentsShort = "`"$backgroundtestimage`" -shave `"$titlecardborderwidthsecond`"  -bordercolor `"$titlecardbordercolor`" -border `"$titlecardborderwidth`" `"$titlecardtestPosterShort`""
        $titlecardArgumentsMedium = "`"$backgroundtestimage`" -shave `"$titlecardborderwidthsecond`"  -bordercolor `"$titlecardbordercolor`" -border `"$titlecardborderwidth`" `"$titlecardtestPosterMedium`""
        $titlecardArgumentsLong = "`"$backgroundtestimage`" -shave `"$titlecardborderwidthsecond`"  -bordercolor `"$titlecardbordercolor`" -border `"$titlecardborderwidth`" `"$titlecardtestPosterLong`""
        $titlecardArgumentsShortCAPS = "`"$backgroundtestimage`" -shave `"$titlecardborderwidthsecond`"  -bordercolor `"$titlecardbordercolor`" -border `"$titlecardborderwidth`" `"$titlecardtestPosterShortCAPS`""
        $titlecardArgumentsMediumCAPS = "`"$backgroundtestimage`" -shave `"$titlecardborderwidthsecond`"  -bordercolor `"$titlecardbordercolor`" -border `"$titlecardborderwidth`" `"$titlecardtestPosterMediumCAPS`""
        $titlecardArgumentsLongCAPS = "`"$backgroundtestimage`" -shave `"$titlecardborderwidthsecond`"  -bordercolor `"$titlecardbordercolor`" -border `"$titlecardborderwidth`" `"$titlecardtestPosterLongCAPS`""
        Write-log -Subtext "Adding Background Borders" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
    }
    if ($Addtitlecardborder -eq 'false' -and $Addtitlecardoverlay -eq 'true') {
        $titlecardArgumentsShort = "`"$backgroundtestimage`" `"$titlecardoverlay`" -gravity south -composite `"$titlecardtestPosterShort`""
        $titlecardArgumentsMedium = "`"$backgroundtestimage`" `"$titlecardoverlay`" -gravity south -composite `"$titlecardtestPosterMedium`""
        $titlecardArgumentsLong = "`"$backgroundtestimage`" `"$titlecardoverlay`" -gravity south -composite `"$titlecardtestPosterLong`""
        $titlecardArgumentsShortCAPS = "`"$backgroundtestimage`" `"$titlecardoverlay`" -gravity south -composite `"$titlecardtestPosterShortCAPS`""
        $titlecardArgumentsMediumCAPS = "`"$backgroundtestimage`" `"$titlecardoverlay`" -gravity south -composite `"$titlecardtestPosterMediumCAPS`""
        $titlecardArgumentsLongCAPS = "`"$backgroundtestimage`" `"$titlecardoverlay`" -gravity south -composite `"$titlecardtestPosterLongCAPS`""
        Write-log -Subtext "Adding Background Overlay" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
    }
    # Background Logging
    $titlecardlogEntryShort = "magick.exe $titlecardArgumentsShort"
    $titlecardlogEntryMedium = "magick.exe $titlecardArgumentsMedium"
    $titlecardlogEntryLong = "magick.exe $titlecardArgumentsLong"
    $titlecardlogEntryShortCAPS = "magick.exe $titlecardArgumentsShortCAPS"
    $titlecardlogEntryMediumCAPS = "magick.exe $titlecardArgumentsMediumCAPS"
    $titlecardlogEntryLongCAPS = "magick.exe $titlecardArgumentsLongCAPS"

    $titlecardlogEntryShort | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append 
    $titlecardlogEntryShortCAPS | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append 
    $titlecardlogEntryMedium | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append 
    $titlecardlogEntryMediumCAPS | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append 
    $titlecardlogEntryLong | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append 
    $titlecardlogEntryLongCAPS | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append

    # Test Background creation
    Start-Process $magick -Wait -NoNewWindow -ArgumentList $titlecardArgumentsShort
    Start-Process $magick -Wait -NoNewWindow -ArgumentList $titlecardArgumentsMedium
    Start-Process $magick -Wait -NoNewWindow -ArgumentList $titlecardArgumentsLong
    Start-Process $magick -Wait -NoNewWindow -ArgumentList $titlecardArgumentsShortCAPS
    Start-Process $magick -Wait -NoNewWindow -ArgumentList $titlecardArgumentsMediumCAPS
    Start-Process $magick -Wait -NoNewWindow -ArgumentList $titlecardArgumentsLongCAPS

    # Logging Background
    Write-log -Subtext "Optimal font size for Short text is: '$titlecardoptimalFontSizeShort'" -Path $global:ScriptRoot\Logs\Testinglog.log -Type Info
    Write-log -Subtext "    Applying text: `"$ShortText`"" -Path $global:ScriptRoot\Logs\Testinglog.log -Type Info
    Write-log -Subtext "Optimal font size for Medium text is: '$titlecardoptimalFontSizeMedium'" -Path $global:ScriptRoot\Logs\Testinglog.log -Type Info
    Write-log -Subtext "    Applying text: `"$MediumText`"" -Path $global:ScriptRoot\Logs\Testinglog.log -Type Info
    Write-log -Subtext "Optimal font size for Long text is: '$titlecardoptimalFontSizeLong'" -Path $global:ScriptRoot\Logs\Testinglog.log -Type Info
    Write-log -Subtext "    Applying text: `"$LongText`"" -Path $global:ScriptRoot\Logs\Testinglog.log -Type Info
    Write-log -Subtext "Optimal font size for Episode text is: '$TitleCardoptimalFontSizeEpisodetext'" -Path $global:ScriptRoot\Logs\Testinglog.log -Type Info
    Write-log -Subtext "    Applying text: `"$Episodetext`"" -Path $global:ScriptRoot\Logs\Testinglog.log -Type Info

    Write-log -Subtext "Optimal font size for Short CAPS text is: '$titlecardoptimalFontSizeShortCAPS'" -Path $global:ScriptRoot\Logs\Testinglog.log -Type Info
    Write-log -Subtext "    Applying CAPS text: `"$ShortTextCAPS`"" -Path $global:ScriptRoot\Logs\Testinglog.log -Type Info
    Write-log -Subtext "Optimal font size for Medium CAPS text is: '$titlecardoptimalFontSizeMediumCAPS'" -Path $global:ScriptRoot\Logs\Testinglog.log -Type Info
    Write-log -Subtext "    Applying CAPS text: `"$MediumTextCAPS`"" -Path $global:ScriptRoot\Logs\Testinglog.log -Type Info
    Write-log -Subtext "Optimal font size for Long CAPS text is: '$titlecardoptimalFontSizeLongCAPS'" -Path $global:ScriptRoot\Logs\Testinglog.log -Type Info
    Write-log -Subtext "    Applying CAPS text: `"$LongTextCAPS`"" -Path $global:ScriptRoot\Logs\Testinglog.log -Type Info
    Write-log -Subtext "Optimal font size for Episode CAPS text is: '$TitleCardoptimalFontSizeEpisodetextCAPS'" -Path $global:ScriptRoot\Logs\Testinglog.log -Type Info
    Write-log -Subtext "    Applying CAPS text: `"$EpisodetextCAPS`"" -Path $global:ScriptRoot\Logs\Testinglog.log -Type Info


    # Text Poster overlay
    $ArgumentsShort = "`"$TestPosterShort`" -gravity center -background none -layers Flatten ( -font `"$fontImagemagick`" -pointsize `"$optimalFontSizeShort`" -fill `"#0000FF`" -size `"$boxsize`" -background `"#ACD7E6`" caption:`"$ShortText`" -trim -gravity south -extent `"$boxsize`" ) -gravity south -geometry +0+`"$text_offset`" -composite `"$TestPosterShort`""
    $ArgumentsMedium = "`"$TestPosterMedium`" -gravity center -background none -layers Flatten ( -font `"$fontImagemagick`" -pointsize `"$optimalFontSizeMedium`" -fill `"#0000FF`" -size `"$boxsize`" -background `"#ACD7E6`" caption:`"$MediumText`" -trim -gravity south -extent `"$boxsize`" ) -gravity south -geometry +0+`"$text_offset`" -composite `"$TestPosterMedium`""
    $ArgumentsLong = "`"$TestPosterLong`" -gravity center -background none -layers Flatten ( -font `"$fontImagemagick`" -pointsize `"$optimalFontSizeLong`" -fill `"#0000FF`" -size `"$boxsize`" -background `"#ACD7E6`" caption:`"$LongText`" -trim -gravity south -extent `"$boxsize`" ) -gravity south -geometry +0+`"$text_offset`" -composite `"$TestPosterLong`""
    $ArgumentsShortCAPS = "`"$TestPosterShortCAPS`" -gravity center -background none -layers Flatten ( -font `"$fontImagemagick`" -pointsize `"$optimalFontSizeShortCAPS`" -fill `"#0000FF`" -size `"$boxsize`" -background `"#ACD7E6`" caption:`"$ShortTextCAPS`" -trim -gravity south -extent `"$boxsize`" ) -gravity south -geometry +0+`"$text_offset`" -composite `"$TestPosterShortCAPS`""
    $ArgumentsMediumCAPS = "`"$TestPosterMediumCAPS`" -gravity center -background none -layers Flatten ( -font `"$fontImagemagick`" -pointsize `"$optimalFontSizeMediumCAPS`" -fill `"#0000FF`" -size `"$boxsize`" -background `"#ACD7E6`" caption:`"$MediumTextCAPS`" -trim -gravity south -extent `"$boxsize`" ) -gravity south -geometry +0+`"$text_offset`" -composite `"$TestPosterMediumCAPS`""
    $ArgumentsLongCAPS = "`"$TestPosterLongCAPS`" -gravity center -background none -layers Flatten ( -font `"$fontImagemagick`" -pointsize `"$optimalFontSizeLongCAPS`" -fill `"#0000FF`" -size `"$boxsize`" -background `"#ACD7E6`" caption:`"$LongTextCAPS`" -trim -gravity south -extent `"$boxsize`" ) -gravity south -geometry +0+`"$text_offset`" -composite `"$TestPosterLongCAPS`""
    
    # Text background overlay
    $backgroundArgumentsShort = "`"$backgroundTestPosterShort`" -gravity center -background none -layers Flatten ( -font `"$backgroundfontImagemagick`" -pointsize `"$backgroundoptimalFontSizeShort`" -fill `"#0000FF`" -size `"$Backgroundboxsize`" -background `"#ACD7E6`" caption:`"$ShortText`" -trim -gravity south -extent `"$Backgroundboxsize`" ) -gravity south -geometry +0+`"$Backgroundtext_offset`" -composite `"$backgroundTestPosterShort`""
    $backgroundArgumentsMedium = "`"$backgroundTestPosterMedium`" -gravity center -background none -layers Flatten ( -font `"$backgroundfontImagemagick`" -pointsize `"$backgroundoptimalFontSizeMedium`" -fill `"#0000FF`" -size `"$Backgroundboxsize`" -background `"#ACD7E6`" caption:`"$MediumText`" -trim -gravity south -extent `"$Backgroundboxsize`" ) -gravity south -geometry +0+`"$Backgroundtext_offset`" -composite `"$backgroundTestPosterMedium`""
    $backgroundArgumentsLong = "`"$backgroundTestPosterLong`" -gravity center -background none -layers Flatten ( -font `"$backgroundfontImagemagick`" -pointsize `"$backgroundoptimalFontSizeLong`" -fill `"#0000FF`" -size `"$Backgroundboxsize`" -background `"#ACD7E6`" caption:`"$LongText`" -trim -gravity south -extent `"$Backgroundboxsize`" ) -gravity south -geometry +0+`"$Backgroundtext_offset`" -composite `"$backgroundTestPosterLong`""
    $backgroundArgumentsShortCAPS = "`"$backgroundTestPosterShortCAPS`" -gravity center -background none -layers Flatten ( -font `"$backgroundfontImagemagick`" -pointsize `"$backgroundoptimalFontSizeShortCAPS`" -fill `"#0000FF`" -size `"$Backgroundboxsize`" -background `"#ACD7E6`" caption:`"$ShortTextCAPS`" -trim -gravity south -extent `"$Backgroundboxsize`" ) -gravity south -geometry +0+`"$Backgroundtext_offset`" -composite `"$backgroundTestPosterShortCAPS`""
    $backgroundArgumentsMediumCAPS = "`"$backgroundTestPosterMediumCAPS`" -gravity center -background none -layers Flatten ( -font `"$backgroundfontImagemagick`" -pointsize `"$backgroundoptimalFontSizeMediumCAPS`" -fill `"#0000FF`" -size `"$Backgroundboxsize`" -background `"#ACD7E6`" caption:`"$MediumTextCAPS`" -trim -gravity south -extent `"$Backgroundboxsize`" ) -gravity south -geometry +0+`"$Backgroundtext_offset`" -composite `"$backgroundTestPosterMediumCAPS`""
    $backgroundArgumentsLongCAPS = "`"$backgroundTestPosterLongCAPS`" -gravity center -background none -layers Flatten ( -font `"$backgroundfontImagemagick`" -pointsize `"$backgroundoptimalFontSizeLongCAPS`" -fill `"#0000FF`" -size `"$Backgroundboxsize`" -background `"#ACD7E6`" caption:`"$LongTextCAPS`" -trim -gravity south -extent `"$Backgroundboxsize`" ) -gravity south -geometry +0+`"$Backgroundtext_offset`" -composite `"$backgroundTestPosterLongCAPS`""
    
    # Text TitleCard Title overlay
    $TitleCardTitleArgumentsShort = "`"$titlecardtestPosterShort`" -gravity center -background none -layers Flatten ( -font `"$titlecardfontImagemagick`" -pointsize `"$TitleCardoptimalFontSizeShort`" -fill `"#0000FF`" -size `"$TitleCardEPTitleboxsize`" -background `"#ACD7E6`" caption:`"$ShortText`" -trim -gravity south -extent `"$TitleCardEPTitleboxsize`" ) -gravity south -geometry +0+`"$TitleCardEPTitletext_offset`" -composite `"$titlecardtestPosterShort`""
    $TitleCardTitleArgumentsMedium = "`"$titlecardtestPosterMedium`" -gravity center -background none -layers Flatten ( -font `"$titlecardfontImagemagick`" -pointsize `"$TitleCardoptimalFontSizeMedium`" -fill `"#0000FF`" -size `"$TitleCardEPTitleboxsize`" -background `"#ACD7E6`" caption:`"$MediumText`" -trim -gravity south -extent `"$TitleCardEPTitleboxsize`" ) -gravity south -geometry +0+`"$TitleCardEPTitletext_offset`" -composite `"$titlecardtestPosterMedium`""
    $TitleCardTitleArgumentsLong = "`"$titlecardtestPosterLong`" -gravity center -background none -layers Flatten ( -font `"$titlecardfontImagemagick`" -pointsize `"$TitleCardoptimalFontSizeLong`" -fill `"#0000FF`" -size `"$TitleCardEPTitleboxsize`" -background `"#ACD7E6`" caption:`"$LongText`" -trim -gravity south -extent `"$TitleCardEPTitleboxsize`" ) -gravity south -geometry +0+`"$TitleCardEPTitletext_offset`" -composite `"$titlecardtestPosterLong`""
    $TitleCardTitleArgumentsShortCAPS = "`"$titlecardtestPosterShortCAPS`" -gravity center -background none -layers Flatten ( -font `"$titlecardfontImagemagick`" -pointsize `"$TitleCardoptimalFontSizeShortCAPS`" -fill `"#0000FF`" -size `"$TitleCardEPTitleboxsize`" -background `"#ACD7E6`" caption:`"$ShortTextCAPS`" -trim -gravity south -extent `"$TitleCardEPTitleboxsize`" ) -gravity south -geometry +0+`"$TitleCardEPTitletext_offset`" -composite `"$titlecardtestPosterShortCAPS`""
    $TitleCardTitleArgumentsMediumCAPS = "`"$titlecardtestPosterMediumCAPS`" -gravity center -background none -layers Flatten ( -font `"$titlecardfontImagemagick`" -pointsize `"$TitleCardoptimalFontSizeMediumCAPS`" -fill `"#0000FF`" -size `"$TitleCardEPTitleboxsize`" -background `"#ACD7E6`" caption:`"$MediumTextCAPS`" -trim -gravity south -extent `"$TitleCardEPTitleboxsize`" ) -gravity south -geometry +0+`"$TitleCardEPTitletext_offset`" -composite `"$titlecardtestPosterMediumCAPS`""
    $TitleCardTitleArgumentsLongCAPS = "`"$titlecardtestPosterLongCAPS`" -gravity center -background none -layers Flatten ( -font `"$titlecardfontImagemagick`" -pointsize `"$TitleCardoptimalFontSizeLongCAPS`" -fill `"#0000FF`" -size `"$TitleCardEPTitleboxsize`" -background `"#ACD7E6`" caption:`"$LongTextCAPS`" -trim -gravity south -extent `"$TitleCardEPTitleboxsize`" ) -gravity south -geometry +0+`"$TitleCardEPTitletext_offset`" -composite `"$titlecardtestPosterLongCAPS`""
        
    # Text TitleCard EP overlay
    $TitleCardEPArgumentsShort = "`"$titlecardtestPosterShort`" -gravity center -background none -layers Flatten ( -font `"$titlecardfontImagemagick`" -pointsize `"$TitleCardoptimalFontSizeEpisodetext`" -fill `"#0000FF`" -size `"$TitleCardEPboxsize`" -background `"#ACD7E6`" caption:`"$Episodetext`" -trim -gravity south -extent `"$TitleCardEPboxsize`" ) -gravity south -geometry +0+`"$TitleCardEPtext_offset`" -composite `"$titlecardtestPosterShort`""
    $TitleCardEPArgumentsMedium = "`"$titlecardtestPosterMedium`" -gravity center -background none -layers Flatten ( -font `"$titlecardfontImagemagick`" -pointsize `"$TitleCardoptimalFontSizeEpisodetext`" -fill `"#0000FF`" -size `"$TitleCardEPboxsize`" -background `"#ACD7E6`" caption:`"$Episodetext`" -trim -gravity south -extent `"$TitleCardEPboxsize`" ) -gravity south -geometry +0+`"$TitleCardEPtext_offset`" -composite `"$titlecardtestPosterMedium`""
    $TitleCardEPArgumentsLong = "`"$titlecardtestPosterLong`" -gravity center -background none -layers Flatten ( -font `"$titlecardfontImagemagick`" -pointsize `"$TitleCardoptimalFontSizeEpisodetext`" -fill `"#0000FF`" -size `"$TitleCardEPboxsize`" -background `"#ACD7E6`" caption:`"$Episodetext`" -trim -gravity south -extent `"$TitleCardEPboxsize`" ) -gravity south -geometry +0+`"$TitleCardEPtext_offset`" -composite `"$titlecardtestPosterLong`""
    $TitleCardEPArgumentsShortCAPS = "`"$titlecardtestPosterShortCAPS`" -gravity center -background none -layers Flatten ( -font `"$titlecardfontImagemagick`" -pointsize `"$TitleCardoptimalFontSizeEpisodetextCAPS`" -fill `"#0000FF`" -size `"$TitleCardEPboxsize`" -background `"#ACD7E6`" caption:`"$EpisodetextCAPS`" -trim -gravity south -extent `"$TitleCardEPboxsize`" ) -gravity south -geometry +0+`"$TitleCardEPtext_offset`" -composite `"$titlecardtestPosterShortCAPS`""
    $TitleCardEPArgumentsMediumCAPS = "`"$titlecardtestPosterMediumCAPS`" -gravity center -background none -layers Flatten ( -font `"$titlecardfontImagemagick`" -pointsize `"$TitleCardoptimalFontSizeEpisodetextCAPS`" -fill `"#0000FF`" -size `"$TitleCardEPboxsize`" -background `"#ACD7E6`" caption:`"$EpisodetextCAPS`" -trim -gravity south -extent `"$TitleCardEPboxsize`" ) -gravity south -geometry +0+`"$TitleCardEPtext_offset`" -composite `"$titlecardtestPosterMediumCAPS`""
    $TitleCardEPArgumentsLongCAPS = "`"$titlecardtestPosterLongCAPS`" -gravity center -background none -layers Flatten ( -font `"$titlecardfontImagemagick`" -pointsize `"$TitleCardoptimalFontSizeEpisodetextCAPS`" -fill `"#0000FF`" -size `"$TitleCardEPboxsize`" -background `"#ACD7E6`" caption:`"$EpisodetextCAPS`" -trim -gravity south -extent `"$TitleCardEPboxsize`" ) -gravity south -geometry +0+`"$TitleCardEPtext_offset`" -composite `"$titlecardtestPosterLongCAPS`""
                

    # Text Poster Logging
    $logEntryShort = "magick.exe $ArgumentsShort"
    $logEntryMedium = "magick.exe $ArgumentsMedium"
    $logEntryLong = "magick.exe $ArgumentsLong"
    $logEntryShortCAPS = "magick.exe $ArgumentsShortCAPS"
    $logEntryMediumCAPS = "magick.exe $ArgumentsMediumCAPS"
    $logEntryLongCAPS = "magick.exe $ArgumentsLongCAPS"

    $logEntryShort | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append 
    $logEntryShortCAPS | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append 
    $logEntryMedium | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append 
    $logEntryMediumCAPS | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append 
    $logEntryLong | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append 
    $logEntryLongCAPS | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append 

    # Text background Logging
    $backgroundlogEntryShort = "magick.exe $backgroundArgumentsShort"
    $backgroundlogEntryMedium = "magick.exe $backgroundArgumentsMedium"
    $backgroundlogEntryLong = "magick.exe $backgroundArgumentsLong"
    $backgroundlogEntryShortCAPS = "magick.exe $backgroundArgumentsShortCAPS"
    $backgroundlogEntryMediumCAPS = "magick.exe $backgroundArgumentsMediumCAPS"
    $backgroundlogEntryLongCAPS = "magick.exe $backgroundArgumentsLongCAPS"

    $backgroundlogEntryShort | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append 
    $backgroundlogEntryShortCAPS | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append 
    $backgroundlogEntryMedium | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append 
    $backgroundlogEntryMediumCAPS | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append 
    $backgroundlogEntryLong | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append 
    $backgroundlogEntryLongCAPS | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append 
    
    # Title Text Titlecard Logging
    $TitleCardTitlelogEntryShort = "magick.exe $TitleCardTitleArgumentsShort"
    $TitleCardTitlelogEntryMedium = "magick.exe $TitleCardTitleArgumentsMedium"
    $TitleCardTitlelogEntryLong = "magick.exe $TitleCardTitleArgumentsLong"
    $TitleCardTitlelogEntryshortCAPS = "magick.exe $TitleCardTitleArgumentsShortCAPS"
    $TitleCardTitlelogEntryMediumCAPS = "magick.exe $TitleCardTitleArgumentsMediumCAPS"
    $TitleCardTitlelogEntryLongCAPS = "magick.exe $TitleCardTitleArgumentsLongCAPS"

    # Episode Text Titlecard Logging
    $TitleCardEPlogEntryShort = "magick.exe $TitleCardEPArgumentsShort"
    $TitleCardEPlogEntryMedium = "magick.exe $TitleCardEPArgumentsMedium"
    $TitleCardEPlogEntryLong = "magick.exe $TitleCardEPArgumentsLong"
    $TitleCardEPlogEntryepisode = "magick.exe $TitleCardEPArgumentsEpisode"
    $TitleCardEPlogEntryshortCAPS = "magick.exe $TitleCardEPArgumentsShortCAPS"
    $TitleCardEPlogEntryMediumCAPS = "magick.exe $TitleCardEPArgumentsMediumCAPS"
    $TitleCardEPlogEntryLongCAPS = "magick.exe $TitleCardEPArgumentsLongCAPS"
    $TitleCardEPlogEntryepisodeCAPS = "magick.exe $TitleCardEPArgumentsEpisodeCAPS"

    $TitleCardTitlelogEntryShort | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append 
    $TitleCardTitlelogEntryShortCAPS | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append 
    $TitleCardTitlelogEntryMedium | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append 
    $TitleCardTitlelogEntryMediumCAPS | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append 
    $TitleCardTitlelogEntryLong | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append 
    $TitleCardTitlelogEntryLongCAPS | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append
    $TitleCardTitlelogEntryEpisode | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append  
    $TitleCardTitlelogEntryepisodeCAPS | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append 

    $TitleCardEPlogEntryShort | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append 
    $TitleCardEPlogEntryShortCAPS | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append 
    $TitleCardEPlogEntryMedium | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append 
    $TitleCardEPlogEntryMediumCAPS | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append 
    $TitleCardEPlogEntryLong | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append 
    $TitleCardEPlogEntryLongCAPS | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append
    $TitleCardEPlogEntryepisode | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append  
    $TitleCardEPlogEntryepisodeCAPS | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append 

    # Text Poster overlaying
    Start-Process $magick -Wait -NoNewWindow -ArgumentList $ArgumentsShort
    Start-Process $magick -Wait -NoNewWindow -ArgumentList $ArgumentsMedium
    Start-Process $magick -Wait -NoNewWindow -ArgumentList $ArgumentsLong
    Start-Process $magick -Wait -NoNewWindow -ArgumentList $ArgumentsShortCAPS
    Start-Process $magick -Wait -NoNewWindow -ArgumentList $ArgumentsMediumCAPS
    Start-Process $magick -Wait -NoNewWindow -ArgumentList $ArgumentsLongCAPS

    # Text Background overlaying
    Start-Process $magick -Wait -NoNewWindow -ArgumentList $backgroundArgumentsShort
    Start-Process $magick -Wait -NoNewWindow -ArgumentList $backgroundArgumentsMedium
    Start-Process $magick -Wait -NoNewWindow -ArgumentList $backgroundArgumentsLong
    Start-Process $magick -Wait -NoNewWindow -ArgumentList $backgroundArgumentsShortCAPS
    Start-Process $magick -Wait -NoNewWindow -ArgumentList $backgroundArgumentsMediumCAPS
    Start-Process $magick -Wait -NoNewWindow -ArgumentList $backgroundArgumentsLongCAPS

    # Title Text TitleCard overlaying
    Start-Process $magick -Wait -NoNewWindow -ArgumentList $TitleCardTitleArgumentsShort
    Start-Process $magick -Wait -NoNewWindow -ArgumentList $TitleCardTitleArgumentsMedium
    Start-Process $magick -Wait -NoNewWindow -ArgumentList $TitleCardTitleArgumentsLong
    Start-Process $magick -Wait -NoNewWindow -ArgumentList $TitleCardTitleArgumentsShortCAPS
    Start-Process $magick -Wait -NoNewWindow -ArgumentList $TitleCardTitleArgumentsMediumCAPS
    Start-Process $magick -Wait -NoNewWindow -ArgumentList $TitleCardTitleArgumentsLongCAPS

    # Episode Text TitleCard overlaying
    Start-Process $magick -Wait -NoNewWindow -ArgumentList $TitleCardEPArgumentsShort
    Start-Process $magick -Wait -NoNewWindow -ArgumentList $TitleCardEPArgumentsMedium
    Start-Process $magick -Wait -NoNewWindow -ArgumentList $TitleCardEPArgumentsLong
    Start-Process $magick -Wait -NoNewWindow -ArgumentList $TitleCardEPArgumentsShortCAPS
    Start-Process $magick -Wait -NoNewWindow -ArgumentList $TitleCardEPArgumentsMediumCAPS
    Start-Process $magick -Wait -NoNewWindow -ArgumentList $TitleCardEPArgumentsLongCAPS

    Write-log -Subtext "Poster/Background Tests finished, you can find them here: $global:ScriptRoot\test" -Path $global:ScriptRoot\Logs\Testinglog.log -Type Success
    Remove-Item -LiteralPath $testimage | out-null
    Remove-Item -LiteralPath $backgroundtestimage | out-null
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
    $IncludedLibraryNames = $Libsoverview.Name -join ', '
    Write-Log -Subtext "Included Libraries: $IncludedLibraryNames" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Trace

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
                    $SeasonRatingkeys = $SeasonsTemp.ratingKey -join ','
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
                $temp | Add-Member -MemberType NoteProperty -Name "SeasonRatingKeys" -Value $SeasonRatingkeys
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

    # Initialize counter variable
    $posterCount = 0
    $SeasonCount = 0
    $EpisodeCount = 0
    $BackgroundCount = 00
    $PosterUnknownCount = 0
    $AllShows = $Libraries | Where-Object { $_.'Library Type' -eq 'show' }
    $AllMovies = $Libraries | Where-Object { $_.'Library Type' -eq 'movie' }

    # Getting information of all Episodes
    if ($global:TitleCards -eq 'True') {
        Write-log -Message "Query episodes data from all Libs, this can take a while..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
        # Query episode info
        $Episodedata = @()
        foreach ($showentry in $AllShows) {
            # Getting child entries for each season
            $splittedkeys = $showentry.SeasonRatingKeys.split(',')
            foreach ($key in $splittedkeys) {
                if ($PlexToken) {
                    if ($contentquery -eq 'Directory') {
                        [xml]$Seasondata = (Invoke-WebRequest $PlexUrl/library/metadata/$key/children?X-Plex-Token=$PlexToken).content
                    }
                }
                Else {
                    if ($contentquery -eq 'Directory') {
                        [xml]$Seasondata = (Invoke-WebRequest $PlexUrl/library/metadata/$key/children?).content
                    }
                }
                $tempseasondata = New-Object psobject
                $tempseasondata | Add-Member -MemberType NoteProperty -Name "Show Name" -Value $Seasondata.MediaContainer.grandparentTitle
                $tempseasondata | Add-Member -MemberType NoteProperty -Name "Type" -Value $Seasondata.MediaContainer.viewGroup
                $tempseasondata | Add-Member -MemberType NoteProperty -Name "tvdbid" -Value $showentry.tvdbid
                $tempseasondata | Add-Member -MemberType NoteProperty -Name "imdbid" -Value $showentry.imdbid
                $tempseasondata | Add-Member -MemberType NoteProperty -Name "tmdbid" -Value $showentry.tmdbid
                $tempseasondata | Add-Member -MemberType NoteProperty -Name "Season Number" -Value $Seasondata.MediaContainer.parentIndex
                $tempseasondata | Add-Member -MemberType NoteProperty -Name "Episodes" -Value $($Seasondata.MediaContainer.video.index -join ',')
                $tempseasondata | Add-Member -MemberType NoteProperty -Name "Title" -Value $($Seasondata.MediaContainer.video.title -join ';')
                $Episodedata += $tempseasondata
            }
        }
        $Episodedata | Select-Object * | Export-Csv -Path "$global:ScriptRoot\Logs\PlexEpisodeExport.csv" -NoTypeInformation -Delimiter ';' -Encoding UTF8 -Force
        Write-log -Subtext "Found '$($Episodedata.Episodes.split(',').count)' Episodes..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Trace
    }
    # Query episode info
    # Download poster foreach movie
    Write-log -Message "Starting poster creation now, this can take a while..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
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
                    $PosterImageoriginal = "$EntryDir\poster.jpg"
                    
                    if (!(Get-ChildItem -LiteralPath $EntryDir -ErrorAction SilentlyContinue)) {
                        New-Item -ItemType Directory -path $EntryDir -Force | out-null
                    }
                }
                Else {
                    $PosterImageoriginal = "$AssetPath\$($entry.RootFoldername).jpg"
                }
    
                $PosterImage = "$global:ScriptRoot\temp\$($entry.RootFoldername).jpg"
                $PosterImage = $PosterImage.Replace('[', '_').Replace(']', '_').Replace('{', '_').Replace('}', '_')
    
                if (!(Get-ChildItem -LiteralPath $PosterImageoriginal -ErrorAction SilentlyContinue)) {
                    # Define Global Variables
                    $global:tmdbid = $entry.tmdbid
                    $global:tvdbid = $entry.tvdbid
                    $global:imdbid = $entry.imdbid
                    $global:posterurl = $null
                    $global:PosterWithText = $null
                    $global:Fallback = $null
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
                    if (!$global:posterurl) {
                        $global:posterurl = GetTVDBMoviePoster
                        $global:IsFallback = $true
                        if (!$global:posterurl -and $global:imdbid) { 
                            Write-log -Subtext "Searching on IMDB for a movie poster" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Trace
                            $global:posterurl = GetIMDBPoster
                            $global:IsFallback = $true
                            if (!$global:posterurl) { 
                                Write-log -Subtext "Could not find a poster on any site" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Error
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
                        Invoke-WebRequest -Uri $global:posterurl -OutFile $PosterImage
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
                                $Arguments = "`"$PosterImage`" -resize `"$PosterSize^`" -gravity center -extent `"$PosterSize`" `"$Posteroverlay`" -gravity south -composite -shave `"$borderwidthsecond`"  -bordercolor `"$bordercolor`" -border `"$borderwidth`" `"$PosterImage`""
                                Write-log -Subtext "Resizing it | Adding Borders | Adding Overlay" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                            }
                            if ($AddBorder -eq 'true' -and $AddOverlay -eq 'false') {
                                $Arguments = "`"$PosterImage`" -resize `"$PosterSize^`" -gravity center -extent `"$PosterSize`" -shave `"$borderwidthsecond`"  -bordercolor `"$bordercolor`" -border `"$borderwidth`" `"$PosterImage`""
                                Write-log -Subtext "Resizing it | Adding Borders" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                            }
                            if ($AddBorder -eq 'false' -and $AddOverlay -eq 'true') {
                                $Arguments = "`"$PosterImage`" -resize `"$PosterSize^`" -gravity center -extent `"$PosterSize`" `"$Posteroverlay`" -gravity south -composite `"$PosterImage`""
                                Write-log -Subtext "Resizing it | Adding Overlay" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                            }
                            if ($AddBorder -eq 'false' -and $AddOverlay -eq 'false') {
                                $Arguments = "`"$PosterImage`" -resize `"$PosterSize^`" -gravity center -extent `"$PosterSize`" `"$PosterImage`""
                                Write-log -Subtext "Resizing it" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                            }
                            $logEntry = "magick.exe $Arguments"
                            $logEntry | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append 
                            Start-Process $magick -Wait -NoNewWindow -ArgumentList $Arguments
        
                            if ($AddText -eq 'true') {
                                $optimalFontSize = Get-OptimalPointSize -text $joinedTitle -font $fontImagemagick -box_width $MaxWidth  -box_height $MaxHeight -min_pointsize $minPointSize -max_pointsize $maxPointSize
                                Write-log -Subtext "Optimal font size set to: '$optimalFontSize'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                                $Arguments = "`"$PosterImage`" -gravity center -background None -layers Flatten `( -font `"$fontImagemagick`" -pointsize `"$optimalFontSize`" -fill `"$fontcolor`" -size `"$boxsize`" -background none caption:`"$joinedTitle`" -trim -gravity south -extent `"$boxsize`" `) -gravity south -geometry +0`"$text_offset`" -composite `"$PosterImage`""
                                Write-log -Subtext "Applying Poster text: `"$joinedTitle`"" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                                $logEntry = "magick.exe $Arguments"
                                $logEntry | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append 
                                Start-Process $magick -Wait -NoNewWindow -ArgumentList $Arguments
                            }
                        }
                        Else {
                            $Resizeargument = "`"$PosterImage`" -resize `"$PosterSize^`" -gravity center -extent `"$PosterSize`" `"$PosterImage`""
                            Write-log -Subtext "Resizing it... " -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                            $logEntry = "magick.exe $Resizeargument"
                            $logEntry | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append 
                            Start-Process $magick -Wait -NoNewWindow -ArgumentList $Resizeargument
                        }
                        # Move file back to original naming with Brackets.
                        Move-Item -LiteralPath $PosterImage $PosterImageoriginal -Force -ErrorAction SilentlyContinue
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
                        $movietemp | Export-Csv -Path "$global:ScriptRoot\Logs\ImageChoices.csv" -NoTypeInformation -Delimiter ';' -Encoding UTF8 -Force -Append
                        $posterCount++
                    }
                    Else {
                        Write-log -Subtext "Missing poster URL for: $($entry.title)" -Path $global:ScriptRoot\Logs\Scriptlog.log  -Type Error
                        Write-log -Subtext "--------------------------------------------------------------------------------" -Path $global:ScriptRoot\Logs\Scriptlog.log  -Type Info
                        $Errorcount++
                    }
                }
                if ($global:BackgroundPosters -eq 'true') {
                    if ($LibraryFolders -eq 'true') {
                        $LibraryName = $entry.'Library Name'
                        $EntryDir = "$AssetPath\$LibraryName\$($entry.RootFoldername)"
                        $backgroundImageoriginal = "$EntryDir\background.jpg"
                        
                        if (!(Get-ChildItem -LiteralPath $EntryDir -ErrorAction SilentlyContinue)) {
                            New-Item -ItemType Directory -path $EntryDir -Force | out-null
                        }
                    }
                    Else {
                        $backgroundImageoriginal = "$AssetPath\$($entry.RootFoldername)_background.jpg"
                    }
        
                    $backgroundImage = "$global:ScriptRoot\temp\$($entry.RootFoldername)_background.jpg"
                    $backgroundImage = $backgroundImage.Replace('[', '_').Replace(']', '_').Replace('{', '_').Replace('}', '_')

                    if (!(Get-ChildItem -LiteralPath $backgroundImageoriginal -ErrorAction SilentlyContinue)) {
                        # Define Global Variables
                        $global:tmdbid = $entry.tmdbid
                        $global:tvdbid = $entry.tvdbid
                        $global:imdbid = $entry.imdbid
                        $global:posterurl = $null
                        $global:IsTruncated = $null
                        $global:PosterWithText = $null
                        Write-log -Message "Start Background Search for: $Titletext" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                        switch -Wildcard ($global:FavProvider) {
                            'TMDB' { if ($entry.tmdbid) { $global:posterurl = GetTMDBMovieBackground }Else { Write-Log -Subtext "Can't search on TMDB, missing ID..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Warning; $global:posterurl = GetFanartMovieBackground } }
                            'FANART' { $global:posterurl = GetFanartMovieBackground }
                            'TVDB' { if ($entry.tvdbid) { $global:posterurl = GetTVDBMovieBackground }Else { Write-Log -Subtext "Can't search on TMDB, missing ID..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Warning; $global:posterurl = GetFanartMovieBackground } }
                            Default { $global:posterurl = GetFanartMovieBackground }
                        }
                        switch -Wildcard ($global:Fallback) {
                            'TMDB' { if ($entry.tmdbid) { $global:posterurl = GetTMDBMovieBackground } }
                            'FANART' { $global:posterurl = GetFanartMovieBackground }
                        }
                        if ($global:PreferTextless -eq 'True') {
                            if (!$global:TextlessPoster -and $global:fanartfallbackposterurl) {
                                $global:posterurl = $global:fanartfallbackposterurl
                                Write-log -Subtext "Took Fanart.tv Fallback background cause its your Fav Provider" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Trace
                                $global:IsFallback = $true
                            }
                            if (!$global:TextlessPoster -and $global:TMDBfallbackposterurl) {
                                $global:posterurl = $global:TMDBfallbackposterurl
                                Write-log -Subtext "Took TMDB Fallback background cause its your Fav Provider" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Trace
                                $global:IsFallback = $true
                            }
                        }
                        if (!$global:posterurl) {
                            $global:posterurl = GetTVDBMovieBackground
                            if ($global:posterurl) { 
                                $global:IsFallback = $true
                            }
                            else { 
                                Write-log -Subtext "Could not find a background on any site" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Error
                            }
                        }
        
                        if ($BackgroundfontAllCaps -eq 'true') {
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
                                    Write-Log -Subtext "Downloading background with Text from 'TMDB'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type debug
                                }
                                Else {
                                    Write-Log -Subtext "Downloading Textless background from 'TMDB'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type debug
                                }
                            }
                            elseif ($global:posterurl -like 'https://assets.fanart.tv*') {
                                if ($global:PosterWithText) {
                                    Write-Log -Subtext "Downloading background with Text from 'FANART'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type debug
                                }
                                Else {
                                    Write-Log -Subtext "Downloading Textless background from 'FANART'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type debug
                                }
                            }
                            elseif ($global:posterurl -like 'https://artworks.thetvdb.com*') {
                                Write-Log -Subtext "Downloading background from 'TVDB'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type debug
                            }
                            Else {
                                Write-Log -Subtext "Downloading background from 'IMDB'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type debug
                            }
                            if ($global:ImageProcessing -eq 'true') {
                                Write-log -Subtext "Processing background for: `"$joinedTitle`"" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
            
                                # Calculate the height to maintain the aspect ratio with a width of 1000 pixels
                                if ($AddBackgroundBorder -eq 'true' -and $AddBackgroundOverlay -eq 'true') {
                                    $Arguments = "`"$backgroundImage`" -resize `"$BackgroundSize^`" -gravity center -extent `"$BackgroundSize`" `"$backgroundoverlay`" -gravity south -composite -shave `"$Backgroundborderwidthsecond`"  -bordercolor `"$Backgroundbordercolor`" -border `"$Backgroundborderwidth`" `"$backgroundImage`""
                                    Write-log -Subtext "Resizing it | Adding Borders | Adding Overlay" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                                }
                                if ($AddBackgroundBorder -eq 'true' -and $AddBackgroundOverlay -eq 'false') {
                                    $Arguments = "`"$backgroundImage`" -resize `"$BackgroundSize^`" -gravity center -extent `"$BackgroundSize`" -shave `"$Backgroundborderwidthsecond`"  -bordercolor `"$Backgroundbordercolor`" -border `"$Backgroundborderwidth`" `"$backgroundImage`""
                                    Write-log -Subtext "Resizing it | Adding Borders" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                                }
                                if ($AddBackgroundBorder -eq 'false' -and $AddBackgroundOverlay -eq 'true') {
                                    $Arguments = "`"$backgroundImage`" -resize `"$BackgroundSize^`" -gravity center -extent `"$BackgroundSize`" `"$Backgroundoverlay`" -gravity south -composite `"$backgroundImage`""
                                    Write-log -Subtext "Resizing it | Adding Overlay" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                                }
                                if ($AddBackgroundBorder -eq 'false' -and $AddBackgroundOverlay -eq 'false') {
                                    $Arguments = "`"$backgroundImage`" -resize `"$BackgroundSize^`" -gravity center -extent `"$BackgroundSize`" `"$backgroundImage`""
                                    Write-log -Subtext "Resizing it" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                                }
                                $logEntry = "magick.exe $Arguments"
                                $logEntry | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append 
                                Start-Process $magick -Wait -NoNewWindow -ArgumentList $Arguments
            
                                if ($AddBackgroundText -eq 'true') {
                                    $optimalFontSize = Get-OptimalPointSize -text $joinedTitle -font $fontImagemagick -box_width $BackgroundMaxWidth  -box_height $BackgroundMaxHeight -min_pointsize $BackgroundminPointSize -max_pointsize $BackgroundmaxPointSize
                                    Write-log -Subtext "Optimal font size set to: '$optimalFontSize'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                                    $Arguments = "`"$backgroundImage`" -gravity center -background None -layers Flatten `( -font `"$fontImagemagick`" -pointsize `"$optimalFontSize`" -fill `"$Backgroundfontcolor`" -size `"$Backgroundboxsize`" -background none caption:`"$joinedTitle`" -trim -gravity south -extent `"$Backgroundboxsize`" `) -gravity south -geometry +0`"$Backgroundtext_offset`" -composite `"$backgroundImage`""
                                    Write-log -Subtext "Applying Background text: `"$joinedTitle`"" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                                    $logEntry = "magick.exe $Arguments"
                                    $logEntry | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append 
                                    Start-Process $magick -Wait -NoNewWindow -ArgumentList $Arguments
                                }
                            }
                            Else {
                                $Resizeargument = "`"$backgroundImage`" -resize `"$BackgroundSize^`" -gravity center -extent `"$BackgroundSize`" `"$backgroundImage`""
                                Write-log -Subtext "Resizing it... " -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                                $logEntry = "magick.exe $Resizeargument"
                                $logEntry | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append 
                                Start-Process $magick -Wait -NoNewWindow -ArgumentList $Resizeargument
                            }
                            # Move file back to original naming with Brackets.
                            Move-Item -LiteralPath $backgroundImage $backgroundImageoriginal -Force -ErrorAction SilentlyContinue
                            Write-log -Subtext "--------------------------------------------------------------------------------" -Path $global:ScriptRoot\Logs\Scriptlog.log  -Type Info
    
                            $moviebackgroundtemp = New-Object psobject
                            $moviebackgroundtemp | Add-Member -MemberType NoteProperty -Name "Title" -Value $Titletext
                            $moviebackgroundtemp | Add-Member -MemberType NoteProperty -Name "Type" -Value 'Movie Background'
                            $moviebackgroundtemp | Add-Member -MemberType NoteProperty -Name "Rootfolder" -Value $($entry.RootFoldername)
                            $moviebackgroundtemp | Add-Member -MemberType NoteProperty -Name "LibraryName" -Value $($entry.'Library Name')
                            $moviebackgroundtemp | Add-Member -MemberType NoteProperty -Name "Textless" -Value $(if ($global:TextlessPoster) { 'True' } else { 'False' })
                            $moviebackgroundtemp | Add-Member -MemberType NoteProperty -Name "Fallback" -Value $(if ($global:IsFallback) { 'True' } else { 'False' })
                            $moviebackgroundtemp | Add-Member -MemberType NoteProperty -Name "TextTruncated" -Value $(if ($global:IsTruncated) { 'True' } else { 'False' })
                            $moviebackgroundtemp | Add-Member -MemberType NoteProperty -Name "Url" -Value $global:posterurl
            
                            # Export the array to a CSV file
                            $moviebackgroundtemp | Export-Csv -Path "$global:ScriptRoot\Logs\ImageChoices.csv" -NoTypeInformation -Delimiter ';' -Encoding UTF8 -Force -Append
                            $posterCount++
                            $BackgroundCount++
                        }
                        Else {
                            Write-log -Subtext "Missing poster URL for: $($entry.title)" -Path $global:ScriptRoot\Logs\Scriptlog.log  -Type Error
                            Write-log -Subtext "--------------------------------------------------------------------------------" -Path $global:ScriptRoot\Logs\Scriptlog.log  -Type Info
                            $Errorcount++
                        }
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
            $Episodepostersearchtext = $null
            $global:TMDBfallbackposterurl = $null
            $global:fanartfallbackposterurl = $null
            $FanartSearched = $null
            $global:posterurl = $null
            $global:PosterWithText = $null
            $global:IsFallback = $null
            $global:Fallback = $null
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
                $PosterImageoriginal = "$EntryDir\poster.jpg"
                        
                if (!(Get-ChildItem -LiteralPath $EntryDir -ErrorAction SilentlyContinue)) {
                    New-Item -ItemType Directory -path $EntryDir -Force | out-null
                }
            }
            Else {
                $PosterImageoriginal = "$AssetPath\$($entry.RootFoldername).jpg"
            }
    
            $PosterImage = "$global:ScriptRoot\temp\$($entry.RootFoldername).jpg"
            $PosterImage = $PosterImage.Replace('[', '_').Replace(']', '_').Replace('{', '_').Replace('}', '_')
            
            if (!(Get-ChildItem -LiteralPath $PosterImageoriginal -ErrorAction SilentlyContinue)) {
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
                    Invoke-WebRequest -Uri $global:posterurl -OutFile $PosterImage
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
                            $Arguments = "`"$PosterImage`" -resize `"$PosterSize^`" -gravity center -extent `"$PosterSize`" `"$Posteroverlay`" -gravity south -composite -shave `"$borderwidthsecond`"  -bordercolor `"$bordercolor`" -border `"$borderwidth`" `"$PosterImage`""
                            Write-log -Subtext "Resizing it | Adding Borders | Adding Overlay" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                        }
                        if ($AddBorder -eq 'true' -and $AddOverlay -eq 'false') {
                            $Arguments = "`"$PosterImage`" -resize `"$PosterSize^`" -gravity center -extent `"$PosterSize`" -shave `"$borderwidthsecond`"  -bordercolor `"$bordercolor`" -border `"$borderwidth`" `"$PosterImage`""
                            Write-log -Subtext "Resizing it | Adding Borders" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                        }
                        if ($AddBorder -eq 'false' -and $AddOverlay -eq 'true') {
                            $Arguments = "`"$PosterImage`" -resize `"$PosterSize^`" -gravity center -extent `"$PosterSize`" `"$Posteroverlay`" -gravity south -composite `"$PosterImage`""
                            Write-log -Subtext "Resizing it | Adding Overlay" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                        }
                        if ($AddBorder -eq 'false' -and $AddOverlay -eq 'false') {
                            $Arguments = "`"$PosterImage`" -resize `"$PosterSize^`" -gravity center -extent `"$PosterSize`" `"$PosterImage`""
                            Write-log -Subtext "Resizing it" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                        }
                        $logEntry = "magick.exe $Arguments"
                        $logEntry | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append 
                        Start-Process $magick -Wait -NoNewWindow -ArgumentList $Arguments
    
                        if ($AddText -eq 'true') {
                            $optimalFontSize = Get-OptimalPointSize -text $joinedTitle -font $fontImagemagick -box_width $MaxWidth  -box_height $MaxHeight -min_pointsize $minPointSize -max_pointsize $maxPointSize
                            Write-log -Subtext "Optimal font size set to: '$optimalFontSize'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                            $Arguments = "`"$PosterImage`" -gravity center -background None -layers Flatten `( -font `"$fontImagemagick`" -pointsize `"$optimalFontSize`" -fill `"$fontcolor`" -size `"$boxsize`" -background none caption:`"$joinedTitle`" -trim -gravity south -extent `"$boxsize`" `) -gravity south -geometry +0`"$text_offset`" -composite `"$PosterImage`""
                            Write-log -Subtext "Applying Poster text: `"$joinedTitle`"" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                            $logEntry = "magick.exe $Arguments"
                            $logEntry | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append 
                            Start-Process $magick -Wait -NoNewWindow -ArgumentList $Arguments
                        }
                    }
                    Else {
                        $Resizeargument = "`"$PosterImage`" -resize `"$PosterSize^`" -gravity center -extent `"$PosterSize`" `"$PosterImage`""
                        Write-log -Subtext "Resizing it... " -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                        $logEntry = "magick.exe $Resizeargument"
                        $logEntry | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append 
                        Start-Process $magick -Wait -NoNewWindow -ArgumentList $Resizeargument
                    }
                    if (Get-ChildItem -LiteralPath $PosterImage -ErrorAction SilentlyContinue) {
                        # Move file back to original naming with Brackets.
                        Move-Item -LiteralPath $PosterImage $PosterImageoriginal -Force -ErrorAction SilentlyContinue
                        Write-log -Subtext "--------------------------------------------------------------------------------" -Path $global:ScriptRoot\Logs\Scriptlog.log  -Type Info
                        $posterCount++
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
                    $showtemp | Export-Csv -Path "$global:ScriptRoot\Logs\ImageChoices.csv" -NoTypeInformation -Delimiter ';' -Encoding UTF8 -Force -Append
                }
                Else {
                    Write-log -Subtext "Missing poster URL for: $($entry.title)" -Path $global:ScriptRoot\Logs\Scriptlog.log  -Type Error
                    Write-log -Subtext "--------------------------------------------------------------------------------" -Path $global:ScriptRoot\Logs\Scriptlog.log  -Type Info
                    $Errorcount++
                }

            }
            # Now we can start the Background Part
            if ($global:BackgroundPosters -eq 'true') {
                if ($LibraryFolders -eq 'true') {
                    $LibraryName = $entry.'Library Name'
                    $EntryDir = "$AssetPath\$LibraryName\$($entry.RootFoldername)"
                    $backgroundImageoriginal = "$EntryDir\background.jpg"
                    
                    if (!(Get-ChildItem -LiteralPath $EntryDir -ErrorAction SilentlyContinue)) {
                        New-Item -ItemType Directory -path $EntryDir -Force | out-null
                    }
                }
                Else {
                    $backgroundImageoriginal = "$AssetPath\$($entry.RootFoldername)_background.jpg"
                }
    
                $backgroundImage = "$global:ScriptRoot\temp\$($entry.RootFoldername)_background.jpg"
                $backgroundImage = $backgroundImage.Replace('[', '_').Replace(']', '_').Replace('{', '_').Replace('}', '_')

                if (!(Get-ChildItem -LiteralPath $backgroundImageoriginal -ErrorAction SilentlyContinue)) {
                    # Define Global Variables
                    $global:tmdbid = $entry.tmdbid
                    $global:tvdbid = $entry.tvdbid
                    $global:imdbid = $entry.imdbid
                    $global:IsTruncated = $null
                    $global:posterurl = $null
                    $global:PosterWithText = $null
                    Write-log -Message "Start Background Search for: $Titletext" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                    switch -Wildcard ($global:FavProvider) {
                        'TMDB' { if ($entry.tmdbid) { $global:posterurl = GetTMDBShowBackground }Else { Write-Log -Subtext "Can't search on TMDB, missing ID..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Warning; $global:posterurl = GetFanartShowBackground } }
                        'FANART' { $global:posterurl = GetFanartShowBackground }
                        'TVDB' { if ($entry.tvdbid) { $global:posterurl = GetTVDBShowBackground }Else { Write-Log -Subtext "Can't search on TMDB, missing ID..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Warning; $global:posterurl = GetFanartShowBackground } }
                        Default { $global:posterurl = GetFanartShowBackground }
                    }
                    switch -Wildcard ($global:Fallback) {
                        'TMDB' { if ($entry.tmdbid) { $global:posterurl = GetTMDBShowBackground } }
                        'FANART' { $global:posterurl = GetFanartShowBackground }
                    }
                    if ($global:PreferTextless -eq 'True') {
                        if (!$global:TextlessPoster -and $global:fanartfallbackposterurl) {
                            $global:posterurl = $global:fanartfallbackposterurl
                            Write-log -Subtext "Took Fanart.tv Fallback background cause its your Fav Provider" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Trace
                            $global:IsFallback = $true
                        }
                        if (!$global:TextlessPoster -and $global:TMDBfallbackposterurl) {
                            $global:posterurl = $global:TMDBfallbackposterurl
                            Write-log -Subtext "Took TMDB Fallback background cause its your Fav Provider" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Trace
                            $global:IsFallback = $true
                        }
                    }
                    if ($global:TextlessPoster -eq 'true' -and $global:posterurl) {
                    } 
                    if (!$global:posterurl) {
                        $global:posterurl = GetTVDBShowBackground
                        $global:IsFallback = $true
                        
                        if (!$global:posterurl) { 
                            Write-log -Subtext "Could not find a background on any site" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Error
                        }
                        
                    }
    
                    if ($BackgroundfontAllCaps -eq 'true') {
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
                                Write-Log -Subtext "Downloading background with Text from 'TMDB'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type debug
                            }
                            Else {
                                Write-Log -Subtext "Downloading Textless background from 'TMDB'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type debug
                            }
                        }
                        elseif ($global:posterurl -like 'https://assets.fanart.tv*') {
                            if ($global:PosterWithText) {
                                Write-Log -Subtext "Downloading background with Text from 'FANART'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type debug
                            }
                            Else {
                                Write-Log -Subtext "Downloading Textless background from 'FANART'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type debug
                            }
                        }
                        elseif ($global:posterurl -like 'https://artworks.thetvdb.com*') {
                            Write-Log -Subtext "Downloading background from 'TVDB'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type debug
                        }
                        Else {
                            Write-Log -Subtext "Downloading background from 'IMDB'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type debug
                        }
                        if ($global:ImageProcessing -eq 'true') {
                            Write-log -Subtext "Processing background for: `"$joinedTitle`"" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
        
                            # Calculate the height to maintain the aspect ratio with a width of 1000 pixels
                            if ($AddBackgroundBorder -eq 'true' -and $AddBackgroundOverlay -eq 'true') {
                                $Arguments = "`"$backgroundImage`" -resize `"$BackgroundSize^`" -gravity center -extent `"$BackgroundSize`" `"$Backgroundoverlay`" -gravity south -composite -shave `"$Backgroundborderwidthsecond`"  -bordercolor `"$Backgroundbordercolor`" -border `"$Backgroundborderwidth`" `"$backgroundImage`""
                                Write-log -Subtext "Resizing it | Adding Borders | Adding Overlay" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                            }
                            if ($AddBackgroundBorder -eq 'true' -and $AddBackgroundOverlay -eq 'false') {
                                $Arguments = "`"$backgroundImage`" -resize `"$BackgroundSize^`" -gravity center -extent `"$BackgroundSize`" -shave `"$Backgroundborderwidthsecond`"  -bordercolor `"$Backgroundbordercolor`" -border `"$Backgroundborderwidth`" `"$backgroundImage`""
                                Write-log -Subtext "Resizing it | Adding Borders" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                            }
                            if ($AddBackgroundBorder -eq 'false' -and $AddBackgroundOverlay -eq 'true') {
                                $Arguments = "`"$backgroundImage`" -resize `"$BackgroundSize^`" -gravity center -extent `"$BackgroundSize`" `"$Backgroundoverlay`" -gravity south -composite `"$backgroundImage`""
                                Write-log -Subtext "Resizing it | Adding Overlay" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                            }
                            if ($AddBackgroundBorder -eq 'false' -and $AddBackgroundOverlay -eq 'false') {
                                $Arguments = "`"$backgroundImage`" -resize `"$BackgroundSize^`" -gravity center -extent `"$BackgroundSize`" `"$backgroundImage`""
                                Write-log -Subtext "Resizing it" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                            }
                            $logEntry = "magick.exe $Arguments"
                            $logEntry | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append 
                            Start-Process $magick -Wait -NoNewWindow -ArgumentList $Arguments
        
                            if ($AddBackgroundText -eq 'true') {
                                $optimalFontSize = Get-OptimalPointSize -text $joinedTitle -font $fontImagemagick -box_width $BackgroundMaxWidth  -box_height $BackgroundMaxHeight -min_pointsize $BackgroundminPointSize -max_pointsize $BackgroundmaxPointSize
                                Write-log -Subtext "Optimal font size set to: '$optimalFontSize'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                                $Arguments = "`"$backgroundImage`" -gravity center -background None -layers Flatten `( -font `"$fontImagemagick`" -pointsize `"$optimalFontSize`" -fill `"$Backgroundfontcolor`" -size `"$Backgroundboxsize`" -background none caption:`"$joinedTitle`" -trim -gravity south -extent `"$Backgroundboxsize`" `) -gravity south -geometry +0`"$Backgroundtext_offset`" -composite `"$backgroundImage`""
                                Write-log -Subtext "Applying Background text: `"$joinedTitle`"" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                                $logEntry = "magick.exe $Arguments"
                                $logEntry | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append 
                                Start-Process $magick -Wait -NoNewWindow -ArgumentList $Arguments
                            }
                        }
                        Else {
                            $Resizeargument = "`"$backgroundImage`" -resize `"$BackgroundSize^`" -gravity center -extent `"$BackgroundSize`" `"$backgroundImage`""
                            Write-log -Subtext "Resizing it... " -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                            $logEntry = "magick.exe $Resizeargument"
                            $logEntry | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append 
                            Start-Process $magick -Wait -NoNewWindow -ArgumentList $Resizeargument
                        }
                        # Move file back to original naming with Brackets.
                        Move-Item -LiteralPath $backgroundImage $backgroundImageoriginal -Force -ErrorAction SilentlyContinue
                        $BackgroundCount++
                        Write-log -Subtext "--------------------------------------------------------------------------------" -Path $global:ScriptRoot\Logs\Scriptlog.log  -Type Info

                        $showbackgroundtemp = New-Object psobject
                        $showbackgroundtemp | Add-Member -MemberType NoteProperty -Name "Title" -Value $Titletext
                        $showbackgroundtemp | Add-Member -MemberType NoteProperty -Name "Type" -Value 'Show Background'
                        $showbackgroundtemp | Add-Member -MemberType NoteProperty -Name "Rootfolder" -Value $($entry.RootFoldername)
                        $showbackgroundtemp | Add-Member -MemberType NoteProperty -Name "LibraryName" -Value $($entry.'Library Name')
                        $showbackgroundtemp | Add-Member -MemberType NoteProperty -Name "Textless" -Value $(if ($global:TextlessPoster) { 'True' } else { 'False' })
                        $showbackgroundtemp | Add-Member -MemberType NoteProperty -Name "Fallback" -Value $(if ($global:IsFallback) { 'True' } else { 'False' })
                        $showbackgroundtemp | Add-Member -MemberType NoteProperty -Name "TextTruncated" -Value $(if ($global:IsTruncated) { 'True' } else { 'False' })
                        $showbackgroundtemp | Add-Member -MemberType NoteProperty -Name "Url" -Value $global:posterurl
        
                        # Export the array to a CSV file
                        $showbackgroundtemp | Export-Csv -Path "$global:ScriptRoot\Logs\ImageChoices.csv" -NoTypeInformation -Delimiter ';' -Encoding UTF8 -Force -Append
                        $posterCount++
                    }
                    Else {
                        Write-log -Subtext "Missing poster URL for: $($entry.title)" -Path $global:ScriptRoot\Logs\Scriptlog.log  -Type Error
                        Write-log -Subtext "--------------------------------------------------------------------------------" -Path $global:ScriptRoot\Logs\Scriptlog.log  -Type Info
                        $Errorcount++
                    }
                }
            }
            # Now we can start the Season Part
            if ($global:SeasonPosters -eq 'true') {
                $global:IsFallback = $null
                $global:IsTruncated = $null
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
                        if (!$global:TextlessPoster -and $global:posterurl) {
                            $global:PosterWithText = $true
                        }
                        if (($global:TextlessFallbackPoster -or $global:TextFallbackPoster) -and $global:PosterWithText) {
                            if ($global:TMDBfallbackposterurl) {
                                Write-Log -Subtext "Taking TMDB Fallback poster..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Type debug
                                $global:posterurl = $global:TMDBfallbackposterurl
                                if ($global:TextlessFallbackPoster) {
                                    $global:TextlessPoster = 'true'
                                }
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
                                        $Arguments = "`"$SeasonImage`" -resize `"$PosterSize^`" -gravity center -extent `"$PosterSize`" `"$Posteroverlay`" -gravity south -composite -shave `"$borderwidthsecond`"  -bordercolor `"$bordercolor`" -border `"$borderwidth`" `"$SeasonImage`""
                                        Write-log -Subtext "Resizing it | Adding Borders | Adding Overlay" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                                    }
                                    if ($AddBorder -eq 'true' -and $AddOverlay -eq 'false') {
                                        $Arguments = "`"$SeasonImage`" -resize `"$PosterSize^`" -gravity center -extent `"$PosterSize`" -shave `"$borderwidthsecond`"  -bordercolor `"$bordercolor`" -border `"$borderwidth`" `"$SeasonImage`""
                                        Write-log -Subtext "Resizing it | Adding Borders" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                                    }
                                    if ($AddBorder -eq 'false' -and $AddOverlay -eq 'true') {
                                        $Arguments = "`"$SeasonImage`" -resize `"$PosterSize^`" -gravity center -extent `"$PosterSize`" `"$Posteroverlay`" -gravity south -composite `"$SeasonImage`""
                                        Write-log -Subtext "Resizing it | Adding Overlay" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                                    }
                                    if ($AddBorder -eq 'false' -and $AddOverlay -eq 'false') {
                                        $Arguments = "`"$SeasonImage`" -resize `"$PosterSize^`" -gravity center -extent `"$PosterSize`" `"$SeasonImage`""
                                        Write-log -Subtext "Resizing it" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                                    }
                                        
                                    $logEntry = "magick.exe $Arguments"
                                    $logEntry | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append 
                                    Start-Process $magick -Wait -NoNewWindow -ArgumentList $Arguments
                                        
                                    if ($AddText -eq 'true') {
                                        $optimalFontSize = Get-OptimalPointSize -text $global:seasonTitle -font $fontImagemagick -box_width $MaxWidth  -box_height $MaxHeight -min_pointsize $minPointSize -max_pointsize $maxPointSize
                                                
                                        Write-log -Subtext "Optimal font size set to: '$optimalFontSize'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                                                
                                        $Arguments = "`"$SeasonImage`" -gravity center -background None -layers Flatten `( -font `"$fontImagemagick`" -pointsize `"$optimalFontSize`" -fill `"$fontcolor`" -size `"$boxsize`" -background none caption:`"$global:seasonTitle`" -trim -gravity south -extent `"$boxsize`" `) -gravity south -geometry +0`"$text_offset`" -composite `"$SeasonImage`""
                                                
                                        Write-log -Subtext "Applying seasonTitle text: `"$global:seasonTitle`"" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
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
                                    $Resizeargument = "`"$SeasonImage`" -resize `"$PosterSize^`" -gravity center -extent `"$PosterSize`" `"$SeasonImage`""
                                    Write-log -Subtext "Resizing it... " -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                                    $logEntry = "magick.exe $Resizeargument"
                                    $logEntry | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append 
                                    Start-Process $magick -Wait -NoNewWindow -ArgumentList $Resizeargument
                                }
                            }
                            if (Get-ChildItem -LiteralPath $SeasonImage -ErrorAction SilentlyContinue) {
                                # Move file back to original naming with Brackets.
                                Move-Item -LiteralPath $SeasonImage -destination $SeasonImageoriginal -Force -ErrorAction SilentlyContinue
                                Write-log -Subtext "--------------------------------------------------------------------------------" -Path $global:ScriptRoot\Logs\Scriptlog.log  -Type Info
                                $SeasonCount++
                                $posterCount++
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
                            $seasontemp | Export-Csv -Path "$global:ScriptRoot\Logs\ImageChoices.csv" -NoTypeInformation -Delimiter ';' -Encoding UTF8 -Force -Append
                        }
                        Else {
                            Write-log -Subtext "Missing poster URL for: $($entry.title)" -Path $global:ScriptRoot\Logs\Scriptlog.log  -Type Error
                            Write-log -Subtext "--------------------------------------------------------------------------------" -Path $global:ScriptRoot\Logs\Scriptlog.log  -Type Info
                            $Errorcount++
                        }
                    }
                }
            }
            # Now we can start the Episode Part
            if ($global:TitleCards -eq 'true') {
                # Loop through each episode
                foreach ($episode in $Episodedata) {
                    $global:season_number = $null
                    $global:episodenumber = $null
                    $global:titles = $null
                    $global:posterurl = $null
                    $global:FileNaming = $null
                    $global:IsTruncated = $null
                    $EpisodeImageoriginal = $null
                    $EpisodeImage = $null
                    $global:Fallback = $null

                    if ($episode.tmdbid -eq $entry.tmdbid -or $episode.tvdbid -eq $entry.tvdbid) {
                        $global:show_name = $episode."Show Name"
                        $global:season_number = $episode."Season Number"
                        $global:episode_numbers = $episode."Episodes".Split(",")
                        $global:titles = $episode."Title".Split(";")
            
                        for ($i = 0; $i -lt $global:episode_numbers.Count; $i++) {
                            $global:EPTitle = $($global:titles[$i].Trim())
                            $global:episodenumber = $($global:episode_numbers[$i].Trim())
                            $global:FileNaming = "S" + $global:season_number.PadLeft(2, '0') + "E" + $global:episodenumber.PadLeft(2, '0')
                            $bullet = [char]0x2022
                            $global:SeasonEPNumber = "Season $global:season_number $bullet Episode $global:episodenumber"
                                    
                            if ($LibraryFolders -eq 'true') {
                                $EpisodeImageoriginal = "$EntryDir\$global:FileNaming.jpg"
                            }
                            Else {
                                $EpisodeImageoriginal = "$AssetPath\$($entry.RootFoldername)_$global:FileNaming.jpg"
                            }
                            $EpisodeImage = "$global:ScriptRoot\temp\$($entry.RootFoldername)_$global:FileNaming.jpg"
                            $EpisodeImage = $EpisodeImage.Replace('[', '_').Replace(']', '_').Replace('{', '_').Replace('}', '_')
                            if (!(Get-ChildItem -LiteralPath $EpisodeImageoriginal -ErrorAction SilentlyContinue)) {
                                if (!$Episodepostersearchtext) {
                                    Write-log -Message "Start Title Card Search for: $global:show_name - $global:SeasonEPNumber" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                                    $Episodepostersearchtext = $true
                                }
                                # now search for season poster, fallback to show backdrop.
                                if ($global:FavProvider -eq 'TMDB') {
                                    if ($episode.tmdbid) {
                                        $global:posterurl = GetTMDBTitleCard
                                        if ($global:Fallback -eq "TVDB") {
                                            $global:posterurl = GetTVDBTitleCard
                                        }
                                        if (!$global:posterurl ) {
                                            Write-log -Subtext "No Title Cards for this Episode on TVDB or TMDB..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Error
                                            $Errorcount++
                                        }
                                    }
                                    else {
                                        Write-Log -Subtext "Can't search on TMDB, missing ID..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Warning
                                        $global:posterurl = GetTVDBTitleCard
                                        if (!$global:posterurl ) {
                                            Write-log -Subtext "No Title Cards for this Episode on TVDB or TMDB..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Error
                                            $Errorcount++
                                        }
                                    }
                                }
                                Else {
                                    if ($episode.tvdbid) {
                                        $global:posterurl = GetTVDBTitleCard
                                        if ($global:Fallback -eq "TMDB") {
                                            $global:posterurl = GetTMDBTitleCard
                                        }
                                        if (!$global:posterurl ) {
                                            Write-log -Subtext "No Title Cards for this Episode on TVDB or TMDB..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Error
                                            $Errorcount++
                                        }
                                    }
                                    else {
                                        Write-Log -Subtext "Can't search on TVDB, missing ID..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Warning
                                        $global:posterurl = GetTMDBTitleCard
                                        if (!$global:posterurl ) {
                                            Write-log -Subtext "No Title Cards for this Episode on TVDB or TMDB..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Error
                                            $Errorcount++
                                        }
                                    }
                                }
                                if ($global:posterurl) {
                                    if ($global:ImageProcessing -eq 'true') {
                                        Invoke-WebRequest -Uri $global:posterurl -OutFile $EpisodeImage
                                        Write-Log -Subtext "Title Card url: $global:posterurl" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                                        if ($global:posterurl -like 'https://image.tmdb.org*') {
                                            Write-Log -Subtext "Downloading Poster from 'TMDB'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type debug
                                            if ($global:FavProvider -ne 'TMDB') { 
                                                $global:IsFallback = $true
                                            }
                                        }
                                        if ($global:posterurl -like 'https://artworks.thetvdb.com*') {
                                            Write-Log -Subtext "Downloading Poster from 'TVDB'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type debug
                                            if ($global:FavProvider -ne 'TVDB') { 
                                                $global:IsFallback = $true
                                            }
                                        }
                                        if (Get-ChildItem -LiteralPath $EpisodeImage -ErrorAction SilentlyContinue) {
                                            # Resize Image to 2000x3000 and apply Border and overlay
                                            if ($AddTitleCardBorder -eq 'true' -and $AddTitleCardOverlay -eq 'true') {
                                                $Arguments = "`"$EpisodeImage`" -resize `"$BackgroundSize^`" -gravity center -extent `"$BackgroundSize`" `"$TitleCardoverlay`" -gravity south -composite -shave `"$TitleCardborderwidthsecond`"  -bordercolor `"$TitleCardbordercolor`" -border `"$TitleCardborderwidth`" `"$EpisodeImage`""
                                                Write-log -Subtext "Resizing it | Adding Borders | Adding Overlay" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                                            }
                                            if ($AddTitleCardBorder -eq 'true' -and $AddTitleCardOverlay -eq 'false') {
                                                $Arguments = "`"$EpisodeImage`" -resize `"$BackgroundSize^`" -gravity center -extent `"$BackgroundSize`" -shave `"$TitleCardborderwidthsecond`"  -bordercolor `"$TitleCardbordercolor`" -border `"$TitleCardborderwidth`" `"$EpisodeImage`""
                                                Write-log -Subtext "Resizing it | Adding Borders" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                                            }
                                            if ($AddTitleCardBorder -eq 'false' -and $AddTitleCardOverlay -eq 'true') {
                                                $Arguments = "`"$EpisodeImage`" -resize `"$BackgroundSize^`" -gravity center -extent `"$BackgroundSize`" `"$TitleCardoverlay`" -gravity south -composite `"$EpisodeImage`""
                                                Write-log -Subtext "Resizing it | Adding Overlay" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                                            }
                                            if ($AddTitleCardBorder -eq 'false' -and $AddTitleCardOverlay -eq 'false') {
                                                $Arguments = "`"$EpisodeImage`" -resize `"$BackgroundSize^`" -gravity center -extent `"$BackgroundSize`" `"$EpisodeImage`""
                                                Write-log -Subtext "Resizing it" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                                            }
                                            $logEntry = "magick.exe $Arguments"
                                            $logEntry | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append 
                                            Start-Process $magick -Wait -NoNewWindow -ArgumentList $Arguments
                                                    
                                            if ($AddTitleCardEPTitleText -eq 'true') {
                                                if ($TitleCardEPTitlefontAllCaps -eq 'true') {
                                                    $global:EPTitle = $global:EPTitle.ToUpper()
                                                }
                                                $optimalFontSize = Get-OptimalPointSize -text $global:EPTitle -font $TitleCardfontImagemagick -box_width $TitleCardEPTitleMaxWidth  -box_height $TitleCardEPTitleMaxHeight -min_pointsize $TitleCardEPTitleminPointSize -max_pointsize $TitleCardEPTitlemaxPointSize
                                                                
                                                Write-log -Subtext "Optimal font size set to: '$optimalFontSize'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                                                                
                                                $Arguments = "`"$EpisodeImage`" -gravity center -background None -layers Flatten `( -font `"$TitleCardfontImagemagick`" -pointsize `"$optimalFontSize`" -fill `"$TitleCardEPTitlefontcolor`" -size `"$TitleCardEPTitleboxsize`" -background none caption:`"$global:EPTitle`" -trim -gravity south -extent `"$TitleCardEPTitleboxsize`" `) -gravity south -geometry +0`"$TitleCardEPTitletext_offset`" -composite `"$EpisodeImage`""
                                                                
                                                Write-log -Subtext "Applying EPTitle text: `"$global:EPTitle`"" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                                                $logEntry = "magick.exe $Arguments"
                                                $logEntry | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append 
                                                Start-Process $magick -Wait -NoNewWindow -ArgumentList $Arguments
                                                        
                                            }
                                            if ($AddTitleCardEPText -eq 'true') {
                                                if ($TitleCardEPfontAllCaps -eq 'true') {
                                                    $global:SeasonEPNumber = $global:SeasonEPNumber.ToUpper()
                                                }
                                                $optimalFontSize = Get-OptimalPointSize -text  $global:SeasonEPNumber -font $TitleCardfontImagemagick -box_width $TitleCardEPMaxWidth  -box_height $TitleCardEPMaxHeight -min_pointsize $TitleCardEPminPointSize -max_pointsize $TitleCardEPmaxPointSize
                                                                
                                                Write-log -Subtext "Optimal font size set to: '$optimalFontSize'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                                                                
                                                $Arguments = "`"$EpisodeImage`" -gravity center -background None -layers Flatten `( -font `"$TitleCardfontImagemagick`" -pointsize `"$optimalFontSize`" -fill `"$TitleCardEPfontcolor`" -size `"$TitleCardEPboxsize`" -background none caption:`" $global:SeasonEPNumber`" -trim -gravity south -extent `"$TitleCardEPboxsize`" `) -gravity south -geometry +0`"$TitleCardEPtext_offset`" -composite `"$EpisodeImage`""
                                                                
                                                Write-log -Subtext "Applying SeasonEPNumber text: `"$global:SeasonEPNumber`"" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                                                $logEntry = "magick.exe $Arguments"
                                                $logEntry | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append 
                                                Start-Process $magick -Wait -NoNewWindow -ArgumentList $Arguments
                                            }
                                        }
                                    }
                                    Else {
                                        Invoke-WebRequest -Uri $global:posterurl -OutFile $EpisodeImage
                                        Write-Log -Subtext "Poster url: $global:posterurl" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                                        if ($global:posterurl -like 'https://image.tmdb.org*') {
                                            Write-Log -Subtext "Downloading Poster from 'TMDB'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type debug
                                            if ($global:FavProvider -ne 'TMDB') { 
                                                $global:IsFallback = $true
                                            }
                                        }
                                        if ($global:posterurl -like 'https://artworks.thetvdb.com*') {
                                            Write-Log -Subtext "Downloading Poster from 'TVDB'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type debug
                                            if ($global:FavProvider -ne 'TVDB') { 
                                                $global:IsFallback = $true
                                            }
                                        }                                           
                                        if (Get-ChildItem -LiteralPath $EpisodeImage -ErrorAction SilentlyContinue) {    
                                            # Resize Image to 2000x3000
                                            $Resizeargument = "`"$EpisodeImage`" -resize `"$BackgroundSize^`" -gravity center -extent `"$BackgroundSize`" `"$EpisodeImage`""
                                            Write-log -Subtext "Resizing it... " -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                                            $logEntry = "magick.exe $Resizeargument"
                                            $logEntry | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append 
                                            Start-Process $magick -Wait -NoNewWindow -ArgumentList $Resizeargument
                                        }
                                    }
                                    if (Get-ChildItem -LiteralPath $EpisodeImage -ErrorAction SilentlyContinue) {
                                        # Move file back to original naming with Brackets.
                                        Move-Item -LiteralPath $EpisodeImage -destination $EpisodeImageoriginal -Force -ErrorAction SilentlyContinue
                                        Write-log -Subtext "--------------------------------------------------------------------------------" -Path $global:ScriptRoot\Logs\Scriptlog.log  -Type Info
                                        $EpisodeCount++
                                        $posterCount++
                                    }
                                    $episodetemp = New-Object psobject
                                    $episodetemp | Add-Member -MemberType NoteProperty -Name "Title" -Value $($global:FileNaming + " | " + $global:EPTitle)
                                    $episodetemp | Add-Member -MemberType NoteProperty -Name "Type" -Value 'Episode'
                                    $episodetemp | Add-Member -MemberType NoteProperty -Name "Rootfolder" -Value $($entry.RootFoldername)
                                    $episodetemp | Add-Member -MemberType NoteProperty -Name "LibraryName" -Value $($entry.'Library Name')
                                    $episodetemp | Add-Member -MemberType NoteProperty -Name "Textless" -Value $(if ($global:TextlessPoster) { 'True' } else { 'False' })
                                    $episodetemp | Add-Member -MemberType NoteProperty -Name "Fallback" -Value $(if ($global:IsFallback) { 'True' } else { 'False' })
                                    $episodetemp | Add-Member -MemberType NoteProperty -Name "TextTruncated" -Value $(if ($global:IsTruncated) { 'True' } else { 'False' })
                                    $episodetemp | Add-Member -MemberType NoteProperty -Name "Url" -Value $global:posterurl
                            
                                    # Export the array to a CSV file
                                    $episodetemp | Export-Csv -Path "$global:ScriptRoot\Logs\ImageChoices.csv" -NoTypeInformation -Delimiter ';' -Encoding UTF8 -Force -Append
                                }
                                Else {
                                    Write-log -Subtext "Missing poster URL for: $($global:SeasonEPNumber)" -Path $global:ScriptRoot\Logs\Scriptlog.log  -Type Error
                                    Write-log -Subtext "--------------------------------------------------------------------------------" -Path $global:ScriptRoot\Logs\Scriptlog.log  -Type Info
                                    $Errorcount++
                                }
                                        
                            }
                        }
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

    Write-log -Message "Finished, Total images created: $posterCount" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Success
    if ($posterCount -ge '1'){
        Write-log -Message "Show/Movie Posters created: $($posterCount-$SeasonCount-$BackgroundCount-$EpisodeCount)| Season images created: $SeasonCount | Background images created: $BackgroundCount | TitleCards created: $EpisodeCount" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Success
    }
    if ((Test-Path $global:ScriptRoot\Logs\ImageChoices.csv)) {
        Write-log -Message "You can find a detailed Summary of image Choices here: $global:ScriptRoot\Logs\ImageChoices.csv" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
        # Calculate Summary
        $SummaryCount = Import-Csv -LiteralPath "$global:ScriptRoot\Logs\ImageChoices.csv" -Delimiter ';'
        $FallbackCount = @($SummaryCount | Where-Object Fallback -eq 'True')
        $TextlessCount = @($SummaryCount | Where-Object Textless -eq 'True')
        $TextTruncatedCount = @($SummaryCount | Where-Object TextTruncated -eq 'True')
        $TextCount = @($SummaryCount | Where-Object Textless -eq 'False')

        if ($TextlessCount) {
            Write-log -Subtext "'$($TextlessCount.count)' times the script took a Textless image" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Warning
        }
        if ($FallbackCount) {
            Write-log -Subtext "'$($FallbackCount.count)' times the script took a fallback image" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Warning
        }
        if ($TextCount) {
            Write-log -Subtext "'$($TextCount.count)' times the script took a image with Text" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Warning
        }
        if ($PosterUnknownCount -ge '1') {
            Write-log -Subtext "'$PosterUnknownCount' times the script took a season poster where we cant tell if it has text or not" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Warning
        }
        if ($TextTruncatedCount) {
            Write-log -Subtext "'$($TextTruncatedCount.count)' times the script truncated the text in images" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Warning
        }
    }
    if ($Errorcount -ge '1') {
        Write-log -Message "During execution '$Errorcount' Errors occurred, please check log for detailed description." -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
    }
    Write-log -Message "Script execution time: $FormattedTimespawn" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
}
