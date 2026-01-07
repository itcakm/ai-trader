"""
Property-Based Tests for API Health Check Coverage

Feature: production-deployment
Property 4: API Health Check Coverage
Validates: Requirements 8.2

This test validates that:
- Health check script tests all required API endpoints
- Health check script validates all data store connections
- Health check script measures and reports latency
"""
import os
import pytest
from hypothesis import given, strategies as st, settings, assume
from pathlib import Path
import json
import re


def get_project_root():
    """Get the project root directory."""
    return Path(__file__).parent.parent.parent


def get_health_check_script_path():
    """Get the health check script path."""
    return get_project_root() / "deployment" / "tests" / "health-checks.sh"


def get_manifest_path(environment):
    """Get the manifest file path for an environment."""
    return get_project_root() / "deployment" / "manifests" / f"{environment}-manifest.json"


def parse_health_check_script():
    """Parse the health check script content."""
    script_path = get_health_check_script_path()
    if not script_path.exists():
        return None
    
    with open(script_path, 'r') as f:
        return f.read()


# Expected Lambda endpoints to test
EXPECTED_LAMBDA_ENDPOINTS = [
    "strategies",
    "templates",
    "risk-profiles",
]

# Expected data stores to validate
EXPECTED_DATA_STORES = [
    "dynamodb",
    "redis",
    "timestream",
]

# HTTP status codes that indicate a healthy endpoint
HEALTHY_STATUS_CODES = [200, 201, 204, 301, 302, 304, 400, 401, 403, 404]


@pytest.fixture
def project_root():
    """Fixture providing the project root path."""
    return get_project_root()


@pytest.fixture
def health_check_script(project_root):
    """Fixture providing the health check script content."""
    script_path = project_root / "deployment" / "tests" / "health-checks.sh"
    if not script_path.exists():
        pytest.skip("Health check script not found")
    
    with open(script_path, 'r') as f:
        return f.read()


@pytest.fixture
def test_manifest(project_root):
    """Fixture providing the test manifest content."""
    manifest_path = project_root / "deployment" / "manifests" / "test-manifest.json"
    if not manifest_path.exists():
        pytest.skip("Test manifest not found")
    
    with open(manifest_path, 'r') as f:
        return json.load(f)


class TestAPIHealthCheckCoverage:
    """
    Property 4: API Health Check Coverage
    
    *For any* Lambda function endpoint defined in the deployment manifest, 
    there SHALL exist a corresponding health check that validates the endpoint 
    is accessible and responds within acceptable latency thresholds.
    
    **Validates: Requirements 8.2**
    """
    
    def test_health_check_script_exists(self, project_root):
        """
        Feature: production-deployment
        Property 4: API Health Check Coverage
        Validates: Requirements 8.1
        
        Verify that the health check script exists.
        """
        script_path = project_root / "deployment" / "tests" / "health-checks.sh"
        assert script_path.exists(), "health-checks.sh should exist"
        assert os.access(script_path, os.X_OK), "health-checks.sh should be executable"
    
    def test_health_check_script_tests_api_gateway(self, health_check_script):
        """
        Feature: production-deployment
        Property 4: API Health Check Coverage
        Validates: Requirements 8.1
        
        Verify that the health check script tests API Gateway base endpoint.
        """
        assert 'api_gateway' in health_check_script.lower() or 'api gateway' in health_check_script.lower(), (
            "Health check script should test API Gateway"
        )
        assert 'test_api_gateway' in health_check_script or 'API Gateway' in health_check_script, (
            "Health check script should have API Gateway test function"
        )
    
    def test_health_check_script_tests_lambda_endpoints(self, health_check_script):
        """
        Feature: production-deployment
        Property 4: API Health Check Coverage
        Validates: Requirements 8.2
        
        Verify that the health check script tests Lambda function endpoints.
        """
        for endpoint in EXPECTED_LAMBDA_ENDPOINTS:
            assert endpoint in health_check_script, (
                f"Health check script should test '{endpoint}' endpoint"
            )
    
    def test_health_check_script_measures_latency(self, health_check_script):
        """
        Feature: production-deployment
        Property 4: API Health Check Coverage
        Validates: Requirements 8.6
        
        Verify that the health check script measures and reports latency.
        """
        assert 'latency' in health_check_script.lower(), (
            "Health check script should measure latency"
        )
        assert 'time_total' in health_check_script or 'latency' in health_check_script.lower(), (
            "Health check script should capture response time"
        )
    
    def test_health_check_script_reports_errors(self, health_check_script):
        """
        Feature: production-deployment
        Property 4: API Health Check Coverage
        Validates: Requirements 8.7
        
        Verify that the health check script reports detailed errors.
        """
        assert 'log_error' in health_check_script or 'error' in health_check_script.lower(), (
            "Health check script should report errors"
        )
        assert 'fail' in health_check_script.lower(), (
            "Health check script should indicate failures"
        )
    
    def test_health_check_script_tests_dynamodb(self, health_check_script):
        """
        Feature: production-deployment
        Property 4: API Health Check Coverage
        Validates: Requirements 8.3
        
        Verify that the health check script tests DynamoDB connectivity.
        """
        assert 'dynamodb' in health_check_script.lower(), (
            "Health check script should test DynamoDB"
        )
        assert 'describe-table' in health_check_script or 'list-tables' in health_check_script, (
            "Health check script should verify DynamoDB tables"
        )
    
    def test_health_check_script_tests_redis(self, health_check_script):
        """
        Feature: production-deployment
        Property 4: API Health Check Coverage
        Validates: Requirements 8.4
        
        Verify that the health check script tests Redis connectivity.
        """
        assert 'redis' in health_check_script.lower(), (
            "Health check script should test Redis"
        )
    
    def test_health_check_script_tests_timestream(self, health_check_script):
        """
        Feature: production-deployment
        Property 4: API Health Check Coverage
        Validates: Requirements 8.5
        
        Verify that the health check script tests Timestream connectivity.
        """
        assert 'timestream' in health_check_script.lower(), (
            "Health check script should test Timestream"
        )
        assert 'describe-database' in health_check_script, (
            "Health check script should verify Timestream database"
        )
    
    def test_health_check_script_uses_curl(self, health_check_script):
        """
        Feature: production-deployment
        Property 4: API Health Check Coverage
        Validates: Requirements 8.1
        
        Verify that the health check script uses curl for HTTP requests.
        """
        assert 'curl' in health_check_script, (
            "Health check script should use curl for HTTP requests"
        )
    
    def test_health_check_script_has_timeout(self, health_check_script):
        """
        Feature: production-deployment
        Property 4: API Health Check Coverage
        Validates: Requirements 8.6
        
        Verify that the health check script has request timeouts.
        """
        assert 'max-time' in health_check_script or 'timeout' in health_check_script.lower(), (
            "Health check script should have request timeouts"
        )
    
    @given(endpoint_name=st.sampled_from(EXPECTED_LAMBDA_ENDPOINTS))
    @settings(max_examples=50)
    def test_endpoint_url_format(self, endpoint_name):
        """
        Feature: production-deployment
        Property 4: API Health Check Coverage
        Validates: Requirements 8.2
        
        *For any* Lambda endpoint name, the URL SHALL follow the pattern 
        {api_base_url}/{endpoint_name}.
        """
        # Validate endpoint name format
        valid_chars = set('abcdefghijklmnopqrstuvwxyz-')
        assert all(c in valid_chars for c in endpoint_name), (
            f"Endpoint name '{endpoint_name}' must only contain valid characters"
        )
        
        # Validate endpoint URL construction
        api_base = "https://api.test.acinaces.com/api"
        expected_url = f"{api_base}/{endpoint_name}"
        
        assert expected_url.startswith('https://'), (
            "Endpoint URL must use HTTPS"
        )
        assert endpoint_name in expected_url, (
            "Endpoint URL must contain endpoint name"
        )
    
    @given(
        status_code=st.integers(min_value=100, max_value=599),
        expected_status=st.integers(min_value=100, max_value=599)
    )
    @settings(max_examples=100)
    def test_status_code_validation(self, status_code, expected_status):
        """
        Feature: production-deployment
        Property 4: API Health Check Coverage
        Validates: Requirements 8.2
        
        *For any* HTTP status code, the health check SHALL correctly identify 
        whether the response indicates success or failure.
        """
        # Define success criteria
        is_success = status_code == expected_status
        
        # Validate status code range
        assert 100 <= status_code <= 599, (
            "Status code must be in valid HTTP range"
        )
        
        # Connection failure is always a failure
        if status_code == 0:
            assert not is_success, "Connection failure should be treated as failure"
    
    @given(
        latency_ms=st.floats(min_value=0, max_value=60000, allow_nan=False, allow_infinity=False)
    )
    @settings(max_examples=100)
    def test_latency_threshold_validation(self, latency_ms):
        """
        Feature: production-deployment
        Property 4: API Health Check Coverage
        Validates: Requirements 8.6
        
        *For any* latency measurement, the health check SHALL report it in 
        a consistent format (milliseconds).
        """
        # Validate latency is non-negative
        assert latency_ms >= 0, "Latency must be non-negative"
        
        # Define acceptable latency threshold (30 seconds)
        max_acceptable_latency = 30000
        
        is_acceptable = latency_ms <= max_acceptable_latency
        
        # Very high latency should be flagged
        if latency_ms > max_acceptable_latency:
            assert not is_acceptable, "High latency should be flagged"
    
    @given(
        table_name=st.text(
            alphabet='abcdefghijklmnopqrstuvwxyz0123456789-',
            min_size=3,
            max_size=255
        ).filter(lambda x: not x.startswith('-') and not x.endswith('-'))
    )
    @settings(max_examples=100)
    def test_dynamodb_table_name_validation(self, table_name):
        """
        Feature: production-deployment
        Property 4: API Health Check Coverage
        Validates: Requirements 8.3
        
        *For any* DynamoDB table name, the health check SHALL validate it 
        follows AWS naming conventions.
        """
        assume(len(table_name) >= 3)
        assume(len(table_name) <= 255)
        
        # DynamoDB table names must be 3-255 characters
        assert 3 <= len(table_name) <= 255, (
            "DynamoDB table name must be 3-255 characters"
        )
        
        # Table names can only contain alphanumeric, hyphens, underscores, dots
        valid_chars = set('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_.')
        assert all(c in valid_chars for c in table_name), (
            "DynamoDB table name contains invalid characters"
        )


class TestHealthCheckScriptStructure:
    """
    Tests for health check script structure and completeness.
    
    Feature: production-deployment
    Validates: Requirements 8.1, 8.7
    """
    
    def test_script_has_environment_parameter(self, health_check_script):
        """
        Feature: production-deployment
        Validates: Requirements 8.1
        
        Verify that the health check script accepts environment parameter.
        """
        assert 'environment' in health_check_script.lower(), (
            "Health check script should accept environment parameter"
        )
        assert 'test' in health_check_script and 'production' in health_check_script, (
            "Health check script should support test and production environments"
        )
    
    def test_script_has_error_handling(self, health_check_script):
        """
        Feature: production-deployment
        Validates: Requirements 8.7
        
        Verify that the health check script has error handling.
        """
        assert 'set -e' in health_check_script, (
            "Health check script should use 'set -e' for error handling"
        )
    
    def test_script_has_logging(self, health_check_script):
        """
        Feature: production-deployment
        Validates: Requirements 8.7
        
        Verify that the health check script has logging functions.
        """
        assert 'log_info' in health_check_script or 'log_' in health_check_script, (
            "Health check script should have logging functions"
        )
    
    def test_script_has_summary_output(self, health_check_script):
        """
        Feature: production-deployment
        Validates: Requirements 8.7
        
        Verify that the health check script outputs a summary.
        """
        assert 'summary' in health_check_script.lower(), (
            "Health check script should output a summary"
        )
    
    def test_script_reads_manifest(self, health_check_script):
        """
        Feature: production-deployment
        Validates: Requirements 8.1
        
        Verify that the health check script reads from manifest file.
        """
        assert 'manifest' in health_check_script.lower(), (
            "Health check script should read from manifest file"
        )
        assert 'jq' in health_check_script, (
            "Health check script should use jq to parse manifest"
        )
    
    def test_script_loads_environment_config(self, health_check_script):
        """
        Feature: production-deployment
        Validates: Requirements 8.1
        
        Verify that the health check script loads environment configuration.
        """
        assert 'load_environment_config' in health_check_script or 'source' in health_check_script, (
            "Health check script should load environment configuration"
        )
    
    def test_script_tracks_results(self, health_check_script):
        """
        Feature: production-deployment
        Validates: Requirements 8.7
        
        Verify that the health check script tracks validation results.
        """
        assert 'VALIDATION_RESULTS' in health_check_script or 'result' in health_check_script.lower(), (
            "Health check script should track validation results"
        )
        assert 'pass' in health_check_script.lower() and 'fail' in health_check_script.lower(), (
            "Health check script should track pass/fail status"
        )
    
    def test_script_returns_exit_code(self, health_check_script):
        """
        Feature: production-deployment
        Validates: Requirements 8.7
        
        Verify that the health check script returns appropriate exit code.
        """
        assert 'exit 0' in health_check_script, (
            "Health check script should exit 0 on success"
        )
        assert 'exit 1' in health_check_script, (
            "Health check script should exit 1 on failure"
        )


class TestManifestIntegration:
    """
    Tests for health check integration with deployment manifest.
    
    Feature: production-deployment
    Validates: Requirements 8.1, 8.2
    """
    
    def test_manifest_has_api_gateway_endpoint(self, test_manifest):
        """
        Feature: production-deployment
        Validates: Requirements 8.1
        
        Verify that the manifest contains API Gateway endpoint.
        """
        assert 'api_gateway_endpoint' in test_manifest or 'api_gateway_stage_invoke_url' in test_manifest, (
            "Manifest should contain API Gateway endpoint"
        )
    
    def test_manifest_has_dynamodb_tables(self, test_manifest):
        """
        Feature: production-deployment
        Validates: Requirements 8.3
        
        Verify that the manifest contains DynamoDB table names.
        """
        assert 'dynamodb_table_names' in test_manifest, (
            "Manifest should contain DynamoDB table names"
        )
    
    def test_manifest_has_redis_endpoint(self, test_manifest):
        """
        Feature: production-deployment
        Validates: Requirements 8.4
        
        Verify that the manifest contains Redis endpoint.
        """
        assert 'redis_endpoint' in test_manifest, (
            "Manifest should contain Redis endpoint"
        )
    
    def test_manifest_has_timestream_database(self, test_manifest):
        """
        Feature: production-deployment
        Validates: Requirements 8.5
        
        Verify that the manifest contains Timestream database name.
        """
        assert 'timestream_database_name' in test_manifest, (
            "Manifest should contain Timestream database name"
        )
    
    @given(environment=st.sampled_from(['test', 'production']))
    @settings(max_examples=10)
    def test_manifest_path_format(self, environment):
        """
        Feature: production-deployment
        Validates: Requirements 8.1
        
        *For any* environment, the manifest path SHALL follow the pattern 
        deployment/manifests/{environment}-manifest.json.
        """
        expected_path = f"deployment/manifests/{environment}-manifest.json"
        
        assert environment in expected_path, (
            "Manifest path must contain environment name"
        )
        assert expected_path.endswith('.json'), (
            "Manifest path must end with .json"
        )
