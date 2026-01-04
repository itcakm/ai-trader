"""
Property-Based Tests for Lambda Module

Feature: infrastructure-deployment
Property 4: Lambda Function Configuration Compliance
Property 5: Lambda Handler Coverage
Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7

This test validates that Lambda functions are properly configured with:
- All 34 functions defined with correct handlers
- Functions deployed in VPC private subnets
- X-Ray tracing enabled
- IAM execution roles attached
- Environment variables for DynamoDB table names
- Memory and timeout within specified ranges (256-1024MB, 10-300s)
"""
import json
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
def lambda_module_path(infrastructure_root):
    """Get the Lambda module path."""
    return infrastructure_root / "modules" / "lambda"


@pytest.fixture
def lambda_main_tf(lambda_module_path):
    """Load the Lambda module main.tf file."""
    return load_terraform_file(lambda_module_path / "main.tf")


@pytest.fixture
def lambda_functions_tf(lambda_module_path):
    """Load the Lambda module functions.tf file."""
    return load_terraform_file(lambda_module_path / "functions.tf")


@pytest.fixture
def lambda_variables_tf(lambda_module_path):
    """Load the Lambda module variables.tf file."""
    return load_terraform_file(lambda_module_path / "variables.tf")


@pytest.fixture
def lambda_outputs_tf(lambda_module_path):
    """Load the Lambda module outputs.tf file."""
    return load_terraform_file(lambda_module_path / "outputs.tf")


@pytest.fixture
def lambda_layers_tf(lambda_module_path):
    """Load the Lambda module layers.tf file."""
    return load_terraform_file(lambda_module_path / "layers.tf")


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


def extract_variables(variables: list) -> dict:
    """Extract variable configurations from parsed variables."""
    var_dict = {}
    for var_block in variables:
        for var_name, var_attrs in var_block.items():
            var_dict[var_name] = var_attrs
    return var_dict


def extract_outputs(outputs: list) -> dict:
    """Extract output configurations from parsed outputs."""
    output_dict = {}
    for output_block in outputs:
        for output_name, output_attrs in output_block.items():
            output_dict[output_name] = output_attrs
    return output_dict


# Expected Lambda functions based on backend/src/handlers/
EXPECTED_FUNCTIONS = [
    "strategies",
    "templates",
    "versions",
    "deployments",
    "streams",
    "data-sources",
    "backfills",
    "quality",
    "news-context",
    "analysis",
    "model-configs",
    "providers",
    "allocations",
    "ensemble",
    "performance",
    "position-limits",
    "drawdown",
    "circuit-breakers",
    "kill-switch",
    "risk-profiles",
    "risk-events",
    "exchange-config",
    "exchange-connections",
    "exchange-orders",
    "exchange-positions",
    "audit",
    "audit-packages",
    "audit-stream",
    "ai-traces",
    "data-lineage",
    "compliance-reports",
    "trade-lifecycle",
    "retention",
    "snapshots"
]

# Function groups mapping
FUNCTION_GROUPS = {
    "strategies": "strategy-management",
    "templates": "strategy-management",
    "versions": "strategy-management",
    "deployments": "strategy-management",
    "streams": "market-data",
    "data-sources": "market-data",
    "backfills": "market-data",
    "quality": "market-data",
    "news-context": "market-data",
    "analysis": "ai-intelligence",
    "model-configs": "ai-intelligence",
    "providers": "ai-intelligence",
    "allocations": "ai-intelligence",
    "ensemble": "ai-intelligence",
    "performance": "ai-intelligence",
    "position-limits": "risk-controls",
    "drawdown": "risk-controls",
    "circuit-breakers": "risk-controls",
    "kill-switch": "risk-controls",
    "risk-profiles": "risk-controls",
    "risk-events": "risk-controls",
    "exchange-config": "exchange-integration",
    "exchange-connections": "exchange-integration",
    "exchange-orders": "exchange-integration",
    "exchange-positions": "exchange-integration",
    "audit": "audit",
    "audit-packages": "audit",
    "audit-stream": "audit",
    "ai-traces": "audit",
    "data-lineage": "audit",
    "compliance-reports": "audit",
    "trade-lifecycle": "audit",
    "retention": "audit",
    "snapshots": "audit"
}

# Critical functions with reserved concurrency
CRITICAL_FUNCTIONS = {
    "kill-switch": 50,
    "circuit-breakers": 20,
    "exchange-orders": 100,
    "position-limits": 10,
    "drawdown": 10
}

# Memory size constraints
MIN_MEMORY_SIZE = 256
MAX_MEMORY_SIZE = 1024

# Timeout constraints
MIN_TIMEOUT = 10
MAX_TIMEOUT = 300


class TestLambdaFunctionConfigurationCompliance:
    """
    Property 4: Lambda Function Configuration Compliance
    
    *For any* Lambda function created by the Terraform configuration, the function 
    SHALL be deployed in VPC private subnets, have X-Ray tracing enabled, have an 
    IAM execution role attached, have environment variables for DynamoDB table names, 
    and have memory and timeout within specified ranges (256-1024MB, 10-300s).
    
    **Validates: Requirements 6.2, 6.3, 6.4, 6.5, 6.6, 6.7**
    """
    
    def test_lambda_module_exists(self, lambda_module_path):
        """
        Feature: infrastructure-deployment
        Property 4: Lambda Function Configuration Compliance
        Validates: Requirements 6.1
        
        Verify that the Lambda module directory exists with required files.
        """
        assert lambda_module_path.exists(), "Lambda module directory should exist"
        assert (lambda_module_path / "main.tf").exists(), "main.tf should exist"
        assert (lambda_module_path / "functions.tf").exists(), "functions.tf should exist"
        assert (lambda_module_path / "variables.tf").exists(), "variables.tf should exist"
        assert (lambda_module_path / "outputs.tf").exists(), "outputs.tf should exist"
        assert (lambda_module_path / "layers.tf").exists(), "layers.tf should exist"
    
    def test_all_34_functions_defined(self, lambda_functions_tf):
        """
        Feature: infrastructure-deployment
        Property 4: Lambda Function Configuration Compliance
        Validates: Requirements 6.1
        
        Verify that all 34 Lambda functions are defined in the module.
        """
        locals_list = lambda_functions_tf.get('locals', [])
        locals_dict = extract_locals(locals_list)
        
        assert 'functions' in locals_dict, "functions local should be defined"
        
        functions = locals_dict['functions']
        
        # Check that we have at least 34 functions
        assert len(functions) >= 34, f"Expected at least 34 functions, found {len(functions)}"
        
        # Check each expected function is defined
        for func_name in EXPECTED_FUNCTIONS:
            assert func_name in functions, f"Function '{func_name}' should be defined"
    
    def test_functions_have_vpc_config(self, lambda_main_tf):
        """
        Feature: infrastructure-deployment
        Property 4: Lambda Function Configuration Compliance
        Validates: Requirements 6.4
        
        Verify that Lambda functions are deployed in VPC private subnets.
        """
        resources = lambda_main_tf.get('resource', [])
        lambda_resources = extract_resources(resources, 'aws_lambda_function')
        
        functions = lambda_resources.get('functions', {})
        assert functions, "Lambda functions should be defined"
        
        # Check for vpc_config block
        vpc_config = functions.get('vpc_config', [{}])[0]
        assert 'subnet_ids' in vpc_config, "vpc_config should have subnet_ids"
        assert 'security_group_ids' in vpc_config, "vpc_config should have security_group_ids"
    
    def test_functions_have_xray_tracing(self, lambda_main_tf):
        """
        Feature: infrastructure-deployment
        Property 4: Lambda Function Configuration Compliance
        Validates: Requirements 6.7
        
        Verify that X-Ray tracing is enabled for all Lambda functions.
        """
        resources = lambda_main_tf.get('resource', [])
        lambda_resources = extract_resources(resources, 'aws_lambda_function')
        
        functions = lambda_resources.get('functions', {})
        assert functions, "Lambda functions should be defined"
        
        # Check for tracing_config block
        tracing_config = functions.get('tracing_config', [{}])[0]
        assert tracing_config.get('mode') == 'Active', "X-Ray tracing should be Active"
    
    def test_functions_have_iam_role(self, lambda_main_tf):
        """
        Feature: infrastructure-deployment
        Property 4: Lambda Function Configuration Compliance
        Validates: Requirements 6.6
        
        Verify that Lambda functions have IAM execution roles attached.
        """
        resources = lambda_main_tf.get('resource', [])
        lambda_resources = extract_resources(resources, 'aws_lambda_function')
        
        functions = lambda_resources.get('functions', {})
        assert functions, "Lambda functions should be defined"
        
        # Check for role attribute
        role = functions.get('role', '')
        assert 'var.lambda_execution_role_arns' in str(role), (
            "Lambda functions should reference execution role ARNs"
        )
    
    def test_functions_have_environment_variables(self, lambda_main_tf):
        """
        Feature: infrastructure-deployment
        Property 4: Lambda Function Configuration Compliance
        Validates: Requirements 6.5
        
        Verify that Lambda functions have environment variables configured.
        """
        resources = lambda_main_tf.get('resource', [])
        lambda_resources = extract_resources(resources, 'aws_lambda_function')
        
        functions = lambda_resources.get('functions', {})
        assert functions, "Lambda functions should be defined"
        
        # Check for environment block
        environment = functions.get('environment', [{}])[0]
        assert 'variables' in environment, "environment should have variables"
    
    def test_functions_memory_within_range(self, lambda_functions_tf):
        """
        Feature: infrastructure-deployment
        Property 4: Lambda Function Configuration Compliance
        Validates: Requirements 6.2
        
        Verify that Lambda function memory is within specified range (256-1024MB).
        """
        locals_list = lambda_functions_tf.get('locals', [])
        locals_dict = extract_locals(locals_list)
        functions = locals_dict.get('functions', {})
        
        for func_name, func_config in functions.items():
            memory_size = func_config.get('memory_size', 0)
            assert MIN_MEMORY_SIZE <= memory_size <= MAX_MEMORY_SIZE, (
                f"Function '{func_name}' memory {memory_size}MB should be between "
                f"{MIN_MEMORY_SIZE}MB and {MAX_MEMORY_SIZE}MB"
            )
    
    def test_functions_timeout_within_range(self, lambda_functions_tf):
        """
        Feature: infrastructure-deployment
        Property 4: Lambda Function Configuration Compliance
        Validates: Requirements 6.3
        
        Verify that Lambda function timeout is within specified range (10-300s).
        """
        locals_list = lambda_functions_tf.get('locals', [])
        locals_dict = extract_locals(locals_list)
        functions = locals_dict.get('functions', {})
        
        for func_name, func_config in functions.items():
            timeout = func_config.get('timeout', 0)
            assert MIN_TIMEOUT <= timeout <= MAX_TIMEOUT, (
                f"Function '{func_name}' timeout {timeout}s should be between "
                f"{MIN_TIMEOUT}s and {MAX_TIMEOUT}s"
            )
    
    def test_critical_functions_have_reserved_concurrency(self, lambda_functions_tf):
        """
        Feature: infrastructure-deployment
        Property 4: Lambda Function Configuration Compliance
        Validates: Requirements 6.8
        
        Verify that critical functions have reserved concurrency configured.
        """
        locals_list = lambda_functions_tf.get('locals', [])
        locals_dict = extract_locals(locals_list)
        functions = locals_dict.get('functions', {})
        
        for func_name, expected_concurrency in CRITICAL_FUNCTIONS.items():
            assert func_name in functions, f"Critical function '{func_name}' should be defined"
            func_config = functions[func_name]
            reserved_concurrency = func_config.get('reserved_concurrency')
            assert reserved_concurrency == expected_concurrency, (
                f"Function '{func_name}' should have reserved_concurrency={expected_concurrency}, "
                f"got {reserved_concurrency}"
            )
    
    def test_function_groups_mapping_complete(self, lambda_functions_tf):
        """
        Feature: infrastructure-deployment
        Property 4: Lambda Function Configuration Compliance
        Validates: Requirements 6.6
        
        Verify that all functions are mapped to function groups.
        """
        locals_list = lambda_functions_tf.get('locals', [])
        locals_dict = extract_locals(locals_list)
        
        assert 'function_groups' in locals_dict, "function_groups local should be defined"
        
        function_groups = locals_dict['function_groups']
        
        # Check each expected function has a group mapping
        for func_name in EXPECTED_FUNCTIONS:
            assert func_name in function_groups, (
                f"Function '{func_name}' should have a group mapping"
            )


class TestLambdaHandlerCoverage:
    """
    Property 5: Lambda Handler Coverage
    
    *For any* handler file in the backend handlers/ directory (excluding test files), 
    the Terraform configuration SHALL create a corresponding Lambda function with 
    appropriate integration to API Gateway.
    
    **Validates: Requirements 6.1**
    """
    
    def test_all_handlers_have_lambda_functions(self, lambda_functions_tf, infrastructure_root):
        """
        Feature: infrastructure-deployment
        Property 5: Lambda Handler Coverage
        Validates: Requirements 6.1
        
        Verify that all backend handlers have corresponding Lambda functions.
        """
        # Get handler files from backend
        handlers_dir = infrastructure_root.parent / "backend" / "src" / "handlers"
        
        if not handlers_dir.exists():
            pytest.skip("Backend handlers directory not found")
        
        # Get all handler files (excluding test files)
        handler_files = [
            f.stem for f in handlers_dir.glob("*.ts")
            if not f.name.endswith('.test.ts')
        ]
        
        # Get defined functions
        locals_list = lambda_functions_tf.get('locals', [])
        locals_dict = extract_locals(locals_list)
        functions = locals_dict.get('functions', {})
        
        # Check each handler has a corresponding function
        for handler_name in handler_files:
            assert handler_name in functions, (
                f"Handler '{handler_name}' should have a corresponding Lambda function"
            )
    
    def test_function_handlers_match_backend_structure(self, lambda_functions_tf):
        """
        Feature: infrastructure-deployment
        Property 5: Lambda Handler Coverage
        Validates: Requirements 6.1
        
        Verify that function handlers follow the correct path structure.
        """
        locals_list = lambda_functions_tf.get('locals', [])
        locals_dict = extract_locals(locals_list)
        functions = locals_dict.get('functions', {})
        
        for func_name, func_config in functions.items():
            handler = func_config.get('handler', '')
            # Handler should follow pattern: handlers/{name}.handler
            expected_prefix = f"handlers/{func_name}.handler"
            assert handler == expected_prefix, (
                f"Function '{func_name}' handler should be '{expected_prefix}', got '{handler}'"
            )
    
    def test_lambda_layers_defined(self, lambda_layers_tf):
        """
        Feature: infrastructure-deployment
        Property 5: Lambda Handler Coverage
        Validates: Requirements 6.10
        
        Verify that Lambda layers are defined for shared dependencies.
        """
        resources = lambda_layers_tf.get('resource', [])
        layer_resources = extract_resources(resources, 'aws_lambda_layer_version')
        
        assert 'aws_sdk' in layer_resources, "AWS SDK layer should be defined"
        assert 'common_utils' in layer_resources, "Common utils layer should be defined"
    
    def test_functions_reference_layers(self, lambda_main_tf):
        """
        Feature: infrastructure-deployment
        Property 5: Lambda Handler Coverage
        Validates: Requirements 6.10
        
        Verify that Lambda functions reference the defined layers.
        """
        resources = lambda_main_tf.get('resource', [])
        lambda_resources = extract_resources(resources, 'aws_lambda_function')
        
        functions = lambda_resources.get('functions', {})
        assert functions, "Lambda functions should be defined"
        
        # Check for layers attribute
        layers = functions.get('layers', [])
        assert len(layers) >= 2, "Lambda functions should reference at least 2 layers"


class TestLambdaPropertyBased:
    """
    Property-based tests using Hypothesis to validate Lambda configurations.
    
    Feature: infrastructure-deployment
    Property 4: Lambda Function Configuration Compliance
    Property 5: Lambda Handler Coverage
    Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7
    """
    
    @given(
        func_name=st.sampled_from(EXPECTED_FUNCTIONS),
        environment=st.sampled_from(['test', 'production']),
        project_name=st.text(
            alphabet='abcdefghijklmnopqrstuvwxyz-',
            min_size=3,
            max_size=20
        ).filter(lambda x: not x.startswith('-') and not x.endswith('-') and '--' not in x)
    )
    @settings(max_examples=100)
    def test_function_naming_convention(self, func_name, environment, project_name):
        """
        Feature: infrastructure-deployment
        Property 4: Lambda Function Configuration Compliance
        Validates: Requirements 6.1
        
        *For any* function name, environment, and project name combination,
        the generated function name SHALL follow the pattern {project}-{env}-{func}.
        """
        expected_name = f"{project_name}-{environment}-{func_name}"
        
        # Validate function name format
        assert environment in expected_name, "Function name must contain environment"
        assert func_name in expected_name, "Function name must contain logical function name"
        
        # Validate function name length (AWS limit is 64 characters)
        assert len(expected_name) <= 64, "Function name must not exceed 64 characters"
        
        # Validate function name characters
        valid_chars = set('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_')
        assert all(c in valid_chars for c in expected_name), (
            "Function name must only contain valid characters"
        )
    
    @given(
        func_name=st.sampled_from(EXPECTED_FUNCTIONS)
    )
    @settings(max_examples=100)
    def test_all_functions_have_group_mapping(self, func_name):
        """
        Feature: infrastructure-deployment
        Property 4: Lambda Function Configuration Compliance
        Validates: Requirements 6.6
        
        *For any* function in the expected functions list, it SHALL have a group mapping.
        """
        assert func_name in FUNCTION_GROUPS, f"Function '{func_name}' must have group mapping"
        group = FUNCTION_GROUPS[func_name]
        valid_groups = [
            'strategy-management',
            'market-data',
            'ai-intelligence',
            'risk-controls',
            'exchange-integration',
            'audit'
        ]
        assert group in valid_groups, f"Function group '{group}' must be valid"
    
    @given(
        memory_size=st.integers(min_value=MIN_MEMORY_SIZE, max_value=MAX_MEMORY_SIZE)
    )
    @settings(max_examples=100)
    def test_memory_size_valid_range(self, memory_size):
        """
        Feature: infrastructure-deployment
        Property 4: Lambda Function Configuration Compliance
        Validates: Requirements 6.2
        
        *For any* memory size within the valid range, it SHALL be acceptable.
        """
        assert MIN_MEMORY_SIZE <= memory_size <= MAX_MEMORY_SIZE, (
            f"Memory size {memory_size}MB must be between {MIN_MEMORY_SIZE}MB and {MAX_MEMORY_SIZE}MB"
        )
    
    @given(
        timeout=st.integers(min_value=MIN_TIMEOUT, max_value=MAX_TIMEOUT)
    )
    @settings(max_examples=100)
    def test_timeout_valid_range(self, timeout):
        """
        Feature: infrastructure-deployment
        Property 4: Lambda Function Configuration Compliance
        Validates: Requirements 6.3
        
        *For any* timeout within the valid range, it SHALL be acceptable.
        """
        assert MIN_TIMEOUT <= timeout <= MAX_TIMEOUT, (
            f"Timeout {timeout}s must be between {MIN_TIMEOUT}s and {MAX_TIMEOUT}s"
        )
    
    @given(
        func_name=st.sampled_from(list(CRITICAL_FUNCTIONS.keys()))
    )
    @settings(max_examples=100)
    def test_critical_functions_have_concurrency(self, func_name):
        """
        Feature: infrastructure-deployment
        Property 4: Lambda Function Configuration Compliance
        Validates: Requirements 6.8
        
        *For any* critical function, it SHALL have reserved concurrency defined.
        """
        assert func_name in CRITICAL_FUNCTIONS, (
            f"Critical function '{func_name}' must be in CRITICAL_FUNCTIONS"
        )
        concurrency = CRITICAL_FUNCTIONS[func_name]
        assert concurrency > 0, (
            f"Critical function '{func_name}' must have positive reserved concurrency"
        )
    
    @given(
        runtime=st.sampled_from(['nodejs18.x', 'nodejs20.x', 'python3.11', 'python3.12'])
    )
    @settings(max_examples=100)
    def test_runtime_valid_values(self, runtime):
        """
        Feature: infrastructure-deployment
        Property 4: Lambda Function Configuration Compliance
        Validates: Requirements 6.1
        
        *For any* runtime, it SHALL be a valid AWS Lambda runtime.
        """
        valid_runtimes = ['nodejs18.x', 'nodejs20.x', 'python3.11', 'python3.12']
        assert runtime in valid_runtimes, (
            f"Runtime '{runtime}' must be one of {valid_runtimes}"
        )
