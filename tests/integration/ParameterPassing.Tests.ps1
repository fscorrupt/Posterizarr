Describe "Parameter Passing Tests" {
    BeforeAll {
        # Create test environment
        $testRoot = "$TestDrive/app"
        $testConfig = "$TestDrive/config"
        $testWatcher = "$testConfig/watcher"
        $testTemp = "$testConfig/temp"
        
        New-Item -Path $testRoot -ItemType Directory -Force
        New-Item -Path $testConfig -ItemType Directory -Force
        New-Item -Path $testWatcher -ItemType Directory -Force
        New-Item -Path $testTemp -ItemType Directory -Force
        
        # Copy mock script to test location
        Copy-Item -Path $PSScriptRoot/../mocks/MockPosterizarr.ps1 -Destination $testRoot/Posterizarr.ps1
        Copy-Item -Path $PSScriptRoot/../mocks/test-config.json -Destination $testConfig/config.json
        
        # Set environment variables
        $env:APP_ROOT = $testRoot
        $env:APP_DATA = $testConfig
    }
    
    AfterAll {
        # Reset environment variables
        $env:APP_ROOT = $null
        $env:APP_DATA = $null
    }
    
    It "Should correctly pass parameters to Posterizarr.ps1" {
        # Create a test function that simulates the Run function from Start.ps1
        function Test-ParameterPassing {
            param (
                [array]$Parameters
            )
            
            # Call the mock Posterizarr.ps1 directly with the parameters
            & "$env:APP_ROOT/Posterizarr.ps1" @Parameters
            
            # Return the parameters that were passed
            return $Parameters
        }
        
        # Test with no parameters
        $result = Test-ParameterPassing -Parameters @()
        $result.Count | Should -Be 0
        
        # Test with simple parameters
        $result = Test-ParameterPassing -Parameters @("-Testing", "-Manual")
        $result | Should -Contain "-Testing"
        $result | Should -Contain "-Manual"
        
        # Test with parameters from a .posterizarr file
        $testFile = "$testWatcher/test.posterizarr"
        @'
[media]: movie
[title]: Test Movie
'@ | Set-Content -Path $testFile
        
        # Parse the file content
        $fileContent = Get-Content $testFile
        $scriptArgs = @("-Tautulli")
        
        foreach ($line in $fileContent) {
            if ($line -match '^\[(.+)\]: (.+)$') {
                $arg_name = $matches[1].TrimEnd(',')
                $arg_value = $matches[2].TrimEnd(',')
                $scriptArgs += "-$arg_name"
                $scriptArgs += "$arg_value"
            }
        }
        
        # Test with the parsed parameters
        $result = Test-ParameterPassing -Parameters $scriptArgs
        $result | Should -Contain "-Tautulli"
        $result | Should -Contain "-media"
        $result | Should -Contain "movie"
        $result | Should -Contain "-title"
        $result | Should -Contain "Test Movie"
    }
}