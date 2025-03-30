# Posterizarr Tests

This directory contains tests for the Posterizarr project, with a focus on testing the Start.ps1 script and the trigger.py script used for Tautulli integration.

## Test Structure

The tests are organized into the following directories:

- `docker/`: tests to validate the docker container
- `unit/`: Unit tests for individual functions in Start.ps1
- `functional/`: Functional tests for different execution modes
- `integration/`: Integration tests that verify interactions with other components
- `mocks/`: Mock files used by the tests

## Running Tests

To run the tests, you need to have PowerShell, Python, and Pester installed. Pester is a testing framework for PowerShell.

### Installing Pester

If you don't have Pester installed, you can install it using the following command:

```powershell
Install-Module -Name Pester -Force -SkipPublisherCheck -Scope CurrentUser
```

### Using VSCode Test Explorer

The project now includes VSCode configuration for the test explorer. To use it:

1. Install the recommended extensions:
   - PowerShell Extension (`ms-vscode.powershell`)
   - Pester Test Explorer (`pspester.pester-test`)
   - Python Extension (`ms-python.python`)
   - Pylance (`ms-python.vscode-pylance`)

2. Open the Test Explorer view in VSCode (click on the flask icon in the sidebar)

3. You should see all Pester tests and Python unittest tests listed in the explorer

4. Click on the play button next to a test to run it, or use the play buttons at the top to run all tests

### Running PowerShell Tests from Command Line

To run all PowerShell tests, navigate to the tests directory and run:

```powershell
./Run-Tests.ps1
```

### Running Python Tests from Command Line

To run the Python unit tests, navigate to the tests directory and run:

```bash
python unit/Trigger.Tests.py
```

### Running Specific Test Types

You can run specific types of tests by using the `-TestType` parameter:

```powershell
# Run only unit tests
./Run-Tests.ps1 -TestType Unit

# Run only functional tests
./Run-Tests.ps1 -TestType Functional

# Run only integration tests
./Run-Tests.ps1 -TestType Integration
```

### Running in CI Mode

For continuous integration environments, you can use the `-CI` switch, which will generate test results in NUnit XML format:

```powershell
./Run-Tests.ps1 -CI
```

This will create a `TestResults.xml` file in the tests directory, which can be used by CI systems to report test results.

## Test Files

### PowerShell Tests
- `unit/Start.Tests.ps1`: Unit tests for individual functions in Start.ps1
- `functional/Modes.Tests.ps1`: Tests for different execution modes (run, watch, scheduled)
- `integration/Integration.Tests.ps1`: Tests for interactions with Posterizarr.ps1 and the environment
- `integration/TriggerIntegration.Tests.ps1`: Tests for the integration between trigger.py and Start.ps1

### Python Tests
- `unit/Trigger.Tests.py`: Unit tests for the trigger.py script used for Tautulli integration

### Mock Files
- `mocks/MockPosterizarr.ps1`: A mock version of Posterizarr.ps1 for testing
- `mocks/test-config.json`: A test configuration file

### Test Runners
- `Run-Tests.ps1`: PowerShell script to run all PowerShell tests
- `run_python_tests.py`: Python script to run all Python tests

## Test Plan

For a detailed test plan, see [Start.ps1.TestPlan.md](Start.ps1.TestPlan.md).

## Adding New Tests

When adding new tests, follow these guidelines:

1. Place unit tests in the `unit/` directory
2. Place functional tests in the `functional/` directory
3. Place integration tests in the `integration/` directory
4. Use descriptive test names that clearly indicate what is being tested
5. Use the Pester `Describe`, `Context`, and `It` blocks to organize tests
6. Use mocks to isolate the code being tested
7. Use the `TestDrive` PSDrive for temporary files and directories

## Best Practices

- Keep tests independent of each other
- Clean up any resources created during tests
- Use mocks to avoid external dependencies
- Write tests that are easy to understand and maintain
- Focus on testing behavior, not implementation details
- Use descriptive error messages
