function ScriptSchedule {
    # Posterizarr File Watcher for Tautulli Recently Added Files
    $inputDir = "$env:APP_DATA/watcher"
    $Scriptargs = "-Tautulli"
    $Directory = Get-ChildItem -Name $inputDir

    if (!$env:RUN_TIME) {
        $env:RUN_TIME = "05:00"  # Set default value if not provided
    }

    $NextScriptRun = $env:RUN_TIME -split ',' | Sort-Object

    Write-Host "File Watcher Started..."
    # Next Run
    while ($true) {
        $elapsedTime = $(get-date) - $StartTime
        $totalTime = $elapsedTime.Days.ToString() + ' Days ' + $elapsedTime.Hours.ToString() + ' Hours ' + $elapsedTime.Minutes.ToString() + ' Min ' + $elapsedTime.Seconds.ToString() + ' Sec'
        $NextScriptRun = $env:RUN_TIME -split ',' | ForEach-Object {
            $Hour = $_.split(':')[0]
            $Minute = $_.split(':')[1]
            $NextTrigger = Get-Date -Hour $Hour -Minute $Minute
            $CurrentTime = Get-Date
            if ($NextTrigger -lt $CurrentTime) {
                $NextTrigger = $NextTrigger.AddDays(1)
            }
            $offset = $NextTrigger - $CurrentTime
            [PSCustomObject]@{
                RunTime = $_
                Offset = $offset.TotalSeconds
            }
        } | Sort-Object -Property Offset | Select-Object -First 1

        # Use the nearest scheduled run time
        $NextScriptRunTime = $NextScriptRun.RunTime
        $NextScriptRunOffset = $NextScriptRun.Offset
        if (!$alreadydisplayed){
            write-host ""
            write-host "Container is running since: " -NoNewline
            write-host "$totalTime" -ForegroundColor Cyan
            CompareScriptVersion
            write-host ""
            Write-Host "Next Script Run is at: $NextScriptRunTime"
            $alreadydisplayed = $true
        }
        if ($NextScriptRunOffset -le '60') {
            $alreadydisplayed = $null
            Start-Sleep $NextScriptRunOffset
            # Calling the Posterizarr Script
            if ((Get-Process | Where-Object commandline -like 'pwsh')) {
                Write-Warning "There is currently running another Process of Posterizarr, skipping this run."
            }
            Else {
                pwsh $env:APP_ROOT/Posterizarr.ps1
            }
        }
        If ($Directory)
        {
            $TautulliTriggers = Get-ChildItem $inputDir -Recurse | Where-Object -FilterScript {
                $_.Extension -match 'posterizarr'
            }

            foreach($item in $TautulliTriggers)
            {
                write-host "Found .posterizarr file..."

                # Get trigger Values
                $triggerargs = Get-Content $item

                # Replace args
                foreach ($line in $triggerargs) {
                    if ($line -match '^\[(.+)\]: (.+)$') {
                        $arg_name = $matches[1]
                        $arg_value = $matches[2]
                        $Scriptargs += " -$arg_name $arg_value"
                    }
                }

                write-host "Building trigger args..."
                write-host "Calling Posterizarr with this args: $Scriptargs"

                # Call Posterizarr with Args
                pwsh -Command "$env:APP_ROOT/Posterizarr.ps1 $Scriptargs"

                # Reset scriptargs
                $Scriptargs = "-Tautulli"
                write-host ""
                write-host "Tautulli Recently added finished, removing trigger file: $($item.Name)"
                write-host ""
                write-host "Container is running since: " -NoNewline
                write-host "$totalTime" -ForegroundColor Cyan
                CompareScriptVersion
                write-host ""
                Write-Host "Next Script Run is at: $NextScriptRunTime"
                Remove-Item "$inputDir/$($item.Name)" -Force -Confirm:$false
            }

            $Directory = Get-ChildItem -Name $inputDir
        }
        if (!$Directory)
        {
            Start-Sleep -Seconds 30
            $Directory = Get-ChildItem -Name $inputDir
        }
    }
}
function GetLatestScriptVersion {
    try {
        return Invoke-RestMethod -Uri "https://github.com/fscorrupt/Posterizarr/raw/main/Release.txt" -Method Get -ErrorAction Stop
    }
    catch {
        Write-Host "Could not query latest script version, Error: $($_.Exception.Message)"
        return $null
    }
}
function CompareScriptVersion {
    <#
    .SYNOPSIS
        Compares the current script version with the latest available version
    .DESCRIPTION
        Extracts the version from Posterizarr.ps1 and compares it with
        the latest version from GitHub, displaying the results
    #>
    try {
        $posterizarrPath = "$env:APP_ROOT/Posterizarr.ps1"
        if (Test-Path $posterizarrPath) {
            $lineContainingVersion = Select-String -Path $posterizarrPath -Pattern '^\$CurrentScriptVersion\s*=\s*"([^"]+)"' | Select-Object -ExpandProperty Line
            $LatestScriptVersion = GetLatestScriptVersion

            if ($lineContainingVersion) {
                # Extract the version from the line
                Write-Host ""
                $version = $lineContainingVersion -replace '^\$CurrentScriptVersion\s*=\s*"([^"]+)".*', '$1'
                Write-Host "Current Script Version: $version | Latest Script Version: $LatestScriptVersion" -ForegroundColor Green
            }
        } else {
            Write-Host "Warning: Could not find Posterizarr.ps1 at $posterizarrPath" -ForegroundColor Yellow
        }
    } catch {
        Write-Host "Error checking script version: $($_.Exception.Message)" -ForegroundColor Red
    }
}
function Test-And-Download {
    param(
        [string]$url,
        [string]$destination
    )

    if (!(Test-Path $destination)) {
        Invoke-WebRequest -Uri $url -OutFile $destination
    }
}
function CopyAssetFiles {
    <#
    .SYNOPSIS
        Copies asset files from APP_ROOT to APP_DATA
    .DESCRIPTION
        Copies all .png and .ttf files from the APP_ROOT directory to the APP_DATA directory,
        which is necessary for the application to function properly
    #>
    # Get all asset files - using wildcard in path to make -Include work correctly
    $assetFiles = Get-ChildItem -Path "$env:APP_ROOT/*" -Include "*.png", "*.ttf" -File
    $fileCount = $assetFiles.Count

    if ($fileCount -eq 0) {
        Write-Host "No .png or .ttf files found in $env:APP_ROOT" -ForegroundColor Yellow
    } else {
        $successCount = 0
        $errorCount = 0

        $assetFiles | ForEach-Object {
            try {
                $destinationPath = Join-Path -Path $env:APP_DATA -ChildPath $_.Name
                Copy-Item -Path $_.FullName -Destination $destinationPath -Force
                $successCount++
            } catch {
                $errorCount++
                Write-Host "Failed to copy $($_.Name): $($_.Exception.Message)" -ForegroundColor Red
            }
        }

        # Simple summary message
        Write-Host "Copied $successCount .png & .ttf files from $env:APP_ROOT to $env:APP_DATA" -ForegroundColor Cyan

        if ($errorCount -gt 0) {
            Write-Host "Failed to copy $errorCount files" -ForegroundColor Yellow
        }
    }
}

Set-PSReadLineOption -HistorySaveStyle SaveNothing

$Header = @"
----------------------------------------------------
Ideas for the container were taken from:
DapperDrivers & Onedr0p
----------------------------------------------------
======================================================
  _____          _            _
 |  __ \        | |          (_)
 | |__) |__  ___| |_ ___ _ __ _ ______ _ _ __ _ __
 |  ___/ _ \/ __| __/ _ \ '__| |_  / _``` | '__| '__|
 | |  | (_) \__ \ ||  __/ |  | |/ / (_| | |  | |
 |_|   \___/|___/\__\___|_|  |_/___\__,_|_|  |_|
 ======================================================
 To support the projects visit:
 https://github.com/fscorrupt/Posterizarr
----------------------------------------------------
"@

Write-Host $Header

if (!$env:APP_ROOT) {
    $env:APP_ROOT = "/app"
}

if (!$env:APP_DATA) {
    $env:APP_DATA = "/config"
}

$ProgressPreference = 'Continue'

# Check script version
CompareScriptVersion

# Move assets to APP_DATA
CopyAssetFiles

# Checking Config file
if (-not (test-path "$env:APP_DATA/config.json")) {
    Write-Host ""
    Write-Host "Could not find a 'config.json' file" -ForegroundColor Red
    Write-Host "Please edit the config.example.json according to GH repo and save it as 'config.json'" -ForegroundColor Yellow
    Write-Host "    After that restart the container..."
    Write-Host "Waiting for config.json file to be created..."
    do {
        Start-Sleep 600
    } until (
        test-path "$env:APP_DATA/config.json"
    )
}

# Check temp dir if there is a Currently running file present
$CurrentlyRunning = "$env:APP_DATA/temp/Posterizarr.Running"

# Clear Running File
if (Test-Path $CurrentlyRunning) {
    Remove-Item -LiteralPath $CurrentlyRunning | out-null
    write-host "Cleared .running file..." -ForegroundColor Green
}

# Show integraded Scripts
$StartTime = Get-Date
write-host "Container Started..." -ForegroundColor Green
ScriptSchedule
