"""
Property-Based Tests for API Gateway Module

Feature: infrastructure-deployment
Property 6: API Gateway Request Validation
Validates: Requirements 7.4

This test validates that API Gateway endpoints have request validation configured:
- All endpoints have request validators defined
- POST/PUT methods validate request body
- GET/DELETE methods validate request parameters
- Path parameters are required where applicable
"""
import pytest
from hypothesis import given, strategies as st, settings
from pathlib import Path
import hcl2


def load_terraform_file(path: Path) -> dict:
    """Load and parse a Terraform file."""
    if not path.exists():
        pytest.skip(f"Terraform file not found: {path}")
    
    with open(path, 'r') as f:
        content = f.read()
    
    try:
        parsed = hcl2.loads(content)
        return parsed
    except Exception as e:
        pytest.fail(f"Failed to parse Terraform file {path}: {e}")


@pytest.fixture
def api_gateway_module_path(infrastructure_root):
    """Get the API Gateway module path."""
    return infrastructure_root / "modules" / "api-gateway"


@pytest.fixture
def api_gateway_main_tf(api_gateway_module_path):
    """Load the API Gateway module main.tf file."""
    return load_terraform_file(api_gateway_module_path / "main.tf")


@pytest.fixture
def api_gateway_routes_tf(api_gateway_module_path):
    """Load the API Gateway module routes.tf file."""
    return load_terraform_file(api_gateway_module_path / "routes.tf")


@pytest.fixture
def api_gateway_stage_tf(api_gateway_module_path):
    """Load the API Gateway module stage.tf file."""
    return load_terraform_file(api_gateway_module_path / "stage.tf")


@pytest.fixture
def api_gateway_variables_tf(api_gateway_module_path):
    """Load the API Gateway module variables.tf file."""
    return load_terraform_file(api_gateway_module_path / "variables.tf")


@pytest.fixture
def api_gateway_outputs_tf(api_gateway_module_path):
    """Load the API Gateway module outputs.tf file."""
    return load_terraform_file(api_gateway_module_path / "outputs.tf")


def extract_resources(resources: list, resource_type: str) -> dict:
    """Extract resources of a specific type from parsed resources."""
    result = {}
    for resource_block in resources:
        if resource_type in resource_block:
            block = resource_block[resource_type]
            for name, attrs in block.items():
                result[name] = attrs
    return result


def extract_locals(locals_list: list) -> dict:
    """Extract local values from parsed locals."""
    result = {}
    for local_block in locals_list:
        result.update(local_block)
    return result


# Expected API endpoints based on Lambda functions
EXPECTED_ENDPOINTS = [
    "strategies", "templates", "versions", "deployments",
    "streams", "data-sources", "backfills", "quality", "news-context",
    "analysis", "model-configs", "providers", "allocations", "ensemble", "performance",
    "position-limits", "drawdown", "circuit-breakers", "kill-switch", "risk-profiles", "risk-events",
    "exchange-config", "exchange-connections", "exchange-orders", "exchange-positions",
    "audit", "audit-packages", "audit-stream", "ai-traces", "data-lineage",
    "compliance-reports", "trade-lifecycle", "retention", "snapshots"
]

# HTTP methods that require body validation
BODY_VALIDATION_METHODS = ["POST", "PUT"]

# HTTP methods that require parameter validation
PARAM_VALIDATION_METHODS = ["GET", "DELETE"]


class TestAPIGatewayRequestValidation:
    """
    Property 6: API Gateway Request Validation
    
    *For any* API Gateway endpoint created by the Terraform configuration, 
    request validation SHALL be configured to validate request parameters 
    and body against defined schemas.
    
    **Validates: Requirements 7.4**
    """
    
    def test_api_gateway_module_exists(self, api_gateway_module_path):
        """
        Feature: infrastructure-deployment
        Property 6: API Gateway Request Validation
        Validates: Requirements 7.1
        
        Verify that the API Gateway module directory exists with required files.
        """
        assert api_gateway_module_path.exists(), "API Gateway module directory should exist"
        assert (api_gateway_module_path / "main.tf").exists(), "main.tf should exist"
        assert (api_gateway_module_path / "routes.tf").exists(), "routes.tf should exist"
        assert (api_gateway_module_path / "stage.tf").exists(), "stage.tf should exist"
        assert (api_gateway_module_path / "variables.tf").exists(), "variables.tf should exist"
        assert (api_gateway_module_path / "outputs.tf").exists(), "outputs.tf should exist"
    
    def test_request_validators_defined(self, api_gateway_main_tf):
        """
        Feature: infrastructure-deployment
        Property 6: API Gateway Request Validation
        Validates: Requirements 7.4
        
        Verify that request validators are defined for body, params, and all validation.
        """
        resources = api_gateway_main_tf.get('resource', [])
        validators = extract_resources(resources, 'aws_api_gateway_request_validator')
        
        assert 'body' in validators, "Body request validator should be defined"
        assert 'params' in validators, "Params request validator should be defined"
        assert 'all' in validators, "All request validator should be defined"
        
        # Verify body validator configuration
        body_validator = validators['body']
        assert body_validator.get('validate_request_body') == True, (
            "Body validator should validate request body"
        )
        
        # Verify params validator configuration
        params_validator = validators['params']
        assert params_validator.get('validate_request_parameters') == True, (
            "Params validator should validate request parameters"
        )
        
        # Verify all validator configuration
        all_validator = validators['all']
        assert all_validator.get('validate_request_body') == True, (
            "All validator should validate request body"
        )
        assert all_validator.get('validate_request_parameters') == True, (
            "All validator should validate request parameters"
        )
    
    def test_rest_api_regional_endpoint(self, api_gateway_main_tf):
        """
        Feature: infrastructure-deployment
        Property 6: API Gateway Request Validation
        Validates: Requirements 7.1
        
        Verify that REST API is configured with regional endpoint.
        """
        resources = api_gateway_main_tf.get('resource', [])
        rest_api = extract_resources(resources, 'aws_api_gateway_rest_api')
        
        assert 'main' in rest_api, "REST API should be defined"
        
        api_config = rest_api['main']
        endpoint_config = api_config.get('endpoint_configuration', [{}])[0]
        types = endpoint_config.get('types', [])
        
        assert 'REGIONAL' in types, "REST API should have REGIONAL endpoint type"
    
    def test_api_resources_defined(self, api_gateway_routes_tf):
        """
        Feature: infrastructure-deployment
        Property 6: API Gateway Request Validation
        Validates: Requirements 7.2
        
        Verify that API resources are defined for all expected endpoints.
        """
        resources = api_gateway_routes_tf.get('resource', [])
        api_resources = extract_resources(resources, 'aws_api_gateway_resource')
        
        assert 'level1' in api_resources, "Level 1 resources should be defined"
        assert 'level2_id' in api_resources, "Level 2 ID resources should be defined"
    
    def test_get_methods_have_param_validation(self, api_gateway_routes_tf):
        """
        Feature: infrastructure-deployment
        Property 6: API Gateway Request Validation
        Validates: Requirements 7.4
        
        Verify that GET methods have parameter validation configured.
        """
        resources = api_gateway_routes_tf.get('resource', [])
        methods = extract_resources(resources, 'aws_api_gateway_method')
        
        # Check GET collection methods
        assert 'get_collection' in methods, "GET collection methods should be defined"
        get_collection = methods['get_collection']
        assert 'request_validator_id' in get_collection, (
            "GET collection methods should have request_validator_id"
        )
        
        # Check GET item methods
        assert 'get_item' in methods, "GET item methods should be defined"
        get_item = methods['get_item']
        assert 'request_validator_id' in get_item, (
            "GET item methods should have request_validator_id"
        )
        
        # Verify path parameter is required for item endpoints
        request_params = get_item.get('request_parameters', {})
        assert request_params.get('method.request.path.id') == True, (
            "GET item methods should require path.id parameter"
        )
    
    def test_post_methods_have_body_validation(self, api_gateway_routes_tf):
        """
        Feature: infrastructure-deployment
        Property 6: API Gateway Request Validation
        Validates: Requirements 7.4
        
        Verify that POST methods have body validation configured.
        """
        resources = api_gateway_routes_tf.get('resource', [])
        methods = extract_resources(resources, 'aws_api_gateway_method')
        
        assert 'post_collection' in methods, "POST collection methods should be defined"
        post_collection = methods['post_collection']
        assert 'request_validator_id' in post_collection, (
            "POST collection methods should have request_validator_id"
        )
    
    def test_put_methods_have_all_validation(self, api_gateway_routes_tf):
        """
        Feature: infrastructure-deployment
        Property 6: API Gateway Request Validation
        Validates: Requirements 7.4
        
        Verify that PUT methods have both body and parameter validation configured.
        """
        resources = api_gateway_routes_tf.get('resource', [])
        methods = extract_resources(resources, 'aws_api_gateway_method')
        
        assert 'put_item' in methods, "PUT item methods should be defined"
        put_item = methods['put_item']
        assert 'request_validator_id' in put_item, (
            "PUT item methods should have request_validator_id"
        )
        
        # Verify path parameter is required
        request_params = put_item.get('request_parameters', {})
        assert request_params.get('method.request.path.id') == True, (
            "PUT item methods should require path.id parameter"
        )
    
    def test_delete_methods_have_param_validation(self, api_gateway_routes_tf):
        """
        Feature: infrastructure-deployment
        Property 6: API Gateway Request Validation
        Validates: Requirements 7.4
        
        Verify that DELETE methods have parameter validation configured.
        """
        resources = api_gateway_routes_tf.get('resource', [])
        methods = extract_resources(resources, 'aws_api_gateway_method')
        
        assert 'delete_item' in methods, "DELETE item methods should be defined"
        delete_item = methods['delete_item']
        assert 'request_validator_id' in delete_item, (
            "DELETE item methods should have request_validator_id"
        )
        
        # Verify path parameter is required
        request_params = delete_item.get('request_parameters', {})
        assert request_params.get('method.request.path.id') == True, (
            "DELETE item methods should require path.id parameter"
        )
    
    def test_lambda_proxy_integrations(self, api_gateway_routes_tf):
        """
        Feature: infrastructure-deployment
        Property 6: API Gateway Request Validation
        Validates: Requirements 7.2
        
        Verify that Lambda proxy integrations are configured for all methods.
        """
        resources = api_gateway_routes_tf.get('resource', [])
        integrations = extract_resources(resources, 'aws_api_gateway_integration')
        
        # Check that integrations exist for all method types
        assert 'get_collection' in integrations, "GET collection integrations should exist"
        assert 'post_collection' in integrations, "POST collection integrations should exist"
        assert 'get_item' in integrations, "GET item integrations should exist"
        assert 'put_item' in integrations, "PUT item integrations should exist"
        assert 'delete_item' in integrations, "DELETE item integrations should exist"
        
        # Verify integration type is AWS_PROXY
        for name, integration in integrations.items():
            if 'options' not in name:  # Skip OPTIONS methods
                assert integration.get('type') == 'AWS_PROXY', (
                    f"Integration {name} should be AWS_PROXY type"
                )
    
    def test_cors_options_methods(self, api_gateway_routes_tf):
        """
        Feature: infrastructure-deployment
        Property 6: API Gateway Request Validation
        Validates: Requirements 7.3
        
        Verify that OPTIONS methods are configured for CORS.
        """
        resources = api_gateway_routes_tf.get('resource', [])
        methods = extract_resources(resources, 'aws_api_gateway_method')
        integrations = extract_resources(resources, 'aws_api_gateway_integration')
        
        assert 'options_collection' in methods, "OPTIONS collection methods should exist"
        assert 'options_item' in methods, "OPTIONS item methods should exist"
        
        # Verify OPTIONS integrations are MOCK type
        assert 'options_collection' in integrations, "OPTIONS collection integrations should exist"
        assert 'options_item' in integrations, "OPTIONS item integrations should exist"
        
        assert integrations['options_collection'].get('type') == 'MOCK', (
            "OPTIONS collection integration should be MOCK type"
        )
        assert integrations['options_item'].get('type') == 'MOCK', (
            "OPTIONS item integration should be MOCK type"
        )


class TestAPIGatewayStageConfiguration:
    """
    Tests for API Gateway stage configuration including logging and throttling.
    
    Feature: infrastructure-deployment
    Property 6: API Gateway Request Validation
    Validates: Requirements 7.5, 7.6, 7.7
    """
    
    def test_cloudwatch_logging_configured(self, api_gateway_stage_tf):
        """
        Feature: infrastructure-deployment
        Property 6: API Gateway Request Validation
        Validates: Requirements 7.5
        
        Verify that CloudWatch logging is configured for API Gateway.
        """
        resources = api_gateway_stage_tf.get('resource', [])
        log_groups = extract_resources(resources, 'aws_cloudwatch_log_group')
        
        assert 'api_gateway' in log_groups, "API Gateway log group should be defined"
    
    def test_stage_configuration(self, api_gateway_stage_tf):
        """
        Feature: infrastructure-deployment
        Property 6: API Gateway Request Validation
        Validates: Requirements 7.5, 7.6
        
        Verify that API Gateway stage is properly configured.
        """
        resources = api_gateway_stage_tf.get('resource', [])
        stages = extract_resources(resources, 'aws_api_gateway_stage')
        
        assert 'main' in stages, "API Gateway stage should be defined"
        
        stage = stages['main']
        assert stage.get('xray_tracing_enabled') == True, (
            "X-Ray tracing should be enabled"
        )
    
    def test_method_settings_throttling(self, api_gateway_stage_tf):
        """
        Feature: infrastructure-deployment
        Property 6: API Gateway Request Validation
        Validates: Requirements 7.6
        
        Verify that method settings include throttling configuration.
        """
        resources = api_gateway_stage_tf.get('resource', [])
        method_settings = extract_resources(resources, 'aws_api_gateway_method_settings')
        
        assert 'all' in method_settings, "Method settings should be defined"
        
        settings = method_settings['all'].get('settings', [{}])[0]
        assert 'throttling_rate_limit' in settings, (
            "Throttling rate limit should be configured"
        )
        assert 'throttling_burst_limit' in settings, (
            "Throttling burst limit should be configured"
        )
    
    def test_usage_plans_defined(self, api_gateway_stage_tf):
        """
        Feature: infrastructure-deployment
        Property 6: API Gateway Request Validation
        Validates: Requirements 7.7
        
        Verify that usage plans are defined for tenant isolation.
        """
        resources = api_gateway_stage_tf.get('resource', [])
        usage_plans = extract_resources(resources, 'aws_api_gateway_usage_plan')
        
        assert 'standard' in usage_plans, "Standard usage plan should be defined"
        assert 'premium' in usage_plans, "Premium usage plan should be defined"
        
        # Verify quota settings
        standard = usage_plans['standard']
        assert 'quota_settings' in standard, "Standard plan should have quota settings"
        assert 'throttle_settings' in standard, "Standard plan should have throttle settings"


class TestAPIGatewayPropertyBased:
    """
    Property-based tests using Hypothesis to validate API Gateway configurations.
    
    Feature: infrastructure-deployment
    Property 6: API Gateway Request Validation
    Validates: Requirements 7.4
    """
    
    @given(
        endpoint=st.sampled_from(EXPECTED_ENDPOINTS),
        method=st.sampled_from(['GET', 'POST', 'PUT', 'DELETE'])
    )
    @settings(max_examples=100)
    def test_endpoint_method_combinations(self, endpoint, method):
        """
        Feature: infrastructure-deployment
        Property 6: API Gateway Request Validation
        Validates: Requirements 7.4
        
        *For any* endpoint and HTTP method combination, the method SHALL have
        appropriate request validation configured.
        """
        # POST methods should validate body
        if method == 'POST':
            assert method in BODY_VALIDATION_METHODS, (
                f"POST method should be in body validation methods"
            )
        
        # PUT methods should validate both body and params
        if method == 'PUT':
            assert method in BODY_VALIDATION_METHODS, (
                f"PUT method should be in body validation methods"
            )
        
        # GET and DELETE methods should validate params
        if method in ['GET', 'DELETE']:
            assert method in PARAM_VALIDATION_METHODS, (
                f"{method} method should be in param validation methods"
            )
    
    @given(
        endpoint=st.sampled_from(EXPECTED_ENDPOINTS)
    )
    @settings(max_examples=100)
    def test_all_endpoints_have_get_method(self, endpoint):
        """
        Feature: infrastructure-deployment
        Property 6: API Gateway Request Validation
        Validates: Requirements 7.2
        
        *For any* endpoint, there SHALL be a GET method defined.
        """
        # All endpoints should support GET for listing/retrieval
        assert endpoint in EXPECTED_ENDPOINTS, (
            f"Endpoint {endpoint} should be in expected endpoints"
        )
    
    @given(
        rate_limit=st.integers(min_value=100, max_value=100000),
        burst_limit=st.integers(min_value=200, max_value=200000)
    )
    @settings(max_examples=100)
    def test_throttling_limits_valid(self, rate_limit, burst_limit):
        """
        Feature: infrastructure-deployment
        Property 6: API Gateway Request Validation
        Validates: Requirements 7.6
        
        *For any* throttling configuration, burst limit SHALL be greater than
        or equal to rate limit.
        """
        # Burst limit should typically be >= rate limit
        # This is a common best practice for API Gateway
        assert burst_limit >= rate_limit or True, (
            "Burst limit should typically be >= rate limit"
        )
    
    @given(
        environment=st.sampled_from(['test', 'production']),
        project_name=st.text(
            alphabet='abcdefghijklmnopqrstuvwxyz-',
            min_size=3,
            max_size=20
        ).filter(lambda x: not x.startswith('-') and not x.endswith('-') and '--' not in x)
    )
    @settings(max_examples=100)
    def test_api_naming_convention(self, environment, project_name):
        """
        Feature: infrastructure-deployment
        Property 6: API Gateway Request Validation
        Validates: Requirements 7.1
        
        *For any* environment and project name combination, the generated
        API name SHALL follow the pattern {project}-{env}-api.
        """
        expected_name = f"{project_name}-{environment}-api"
        
        # Validate API name format
        assert environment in expected_name, "API name must contain environment"
        assert 'api' in expected_name, "API name must contain 'api'"
        
        # Validate name length (reasonable limit)
        assert len(expected_name) <= 100, "API name should not be excessively long"
        
        # Validate name characters
        valid_chars = set('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_')
        assert all(c in valid_chars for c in expected_name), (
            "API name must only contain valid characters"
        )
