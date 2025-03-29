param (
    [Parameter(Mandatory=$false)]
    [ValidateSet("All", "Unit", "Functional", "Integration")]
    [string]$TestType = "All",   
    [Parameter(Mandatory=$false)]
    [switch]$CI
)

# Ensure Pester is installed
if (-not (Get-Module -ListAvailable -Name Pester)) {
    Write-Host "Pester module not found. Installing Pester..." -ForegroundColor Yellow
    Install-Module -Name Pester -Force -SkipPublisherCheck -Scope CurrentUser
}

# Import Pester
Import-Module Pester

# Set Pester configuration
$configuration = [PesterConfiguration]::Default
$configuration.Run.Path = "$PSScriptRoot"
$configuration.Output.Verbosity = 'Detailed'
$configuration.TestResult.Enabled = $CI.IsPresent
$configuration.TestResult.OutputPath = "$PSScriptRoot/TestResults.xml"
$configuration.TestResult.OutputFormat = 'NUnitXml'

# Filter tests based on TestType parameter
if ($TestType -ne "All") {
    $testPath = switch ($TestType) {
        "Unit" { "$PSScriptRoot/unit" }
        "Functional" { "$PSScriptRoot/functional" }
        "Integration" { "$PSScriptRoot/integration" }
    }
    $configuration.Run.Path = $testPath
}

# Display test information
Write-Host "Running $TestType tests..." -ForegroundColor Cyan
Write-Host "Test path: $($configuration.Run.Path)" -ForegroundColor Cyan
if ($CI.IsPresent) {
    Write-Host "CI mode enabled. Test results will be saved to: $($configuration.TestResult.OutputPath)" -ForegroundColor Cyan
}

# Run Pester tests
Invoke-Pester -Configuration $configuration

# If in CI mode, check for test failures and exit with appropriate code
if ($CI.IsPresent) {
    $testResults = [xml](Get-Content -Path $configuration.TestResult.OutputPath)
    $failedTests = $testResults.SelectNodes("//test-case[@result='Failed']")
    
    if ($failedTests.Count -gt 0) {
        Write-Host "Tests failed: $($failedTests.Count)" -ForegroundColor Red
        exit 1
    } else {
        Write-Host "All tests passed!" -ForegroundColor Green
        exit 0
    }
}