# Posterizarr Tests

This directory contains tests for the Posterizarr project, with a focus on testing the Start.ps1 script.

## Test Structure

The tests are organized into the following directories:

- `unit/`: Unit tests for individual functions in Start.ps1
- `functional/`: Functional tests for different execution modes
- `integration/`: Integration tests that verify interactions with other components
- `mocks/`: Mock files used by the tests

## Running Tests

To run the tests, you need to have PowerShell and Pester installed. Pester is a testing framework for PowerShell.

### Installing Pester

If you don't have Pester installed, you can install it using the following command:

```powershell
Install-Module -Name Pester -Force -SkipPublisherCheck -Scope CurrentUser
```

### Running All Tests

To run all tests, navigate to the tests directory and run:

```powershell
./Run-Tests.ps1
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

- `unit/Start.Tests.ps1`: Unit tests for individual functions in Start.ps1
- `functional/Modes.Tests.ps1`: Tests for different execution modes (run, watch, scheduled)
- `integration/Integration.Tests.ps1`: Tests for interactions with Posterizarr.ps1 and the environment
- `mocks/MockPosterizarr.ps1`: A mock version of Posterizarr.ps1 for testing
- `mocks/test-config.json`: A test configuration file

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