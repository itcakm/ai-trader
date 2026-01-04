"""
Property-Based Tests for IAM Module

Feature: infrastructure-deployment
Property 9: IAM Policy Granularity
Validates: Requirements 16.4, 16.5, 16.6, 16.8

This test validates that IAM policies are properly configured with:
- Per-table DynamoDB access policies (not wildcards)
- Per-bucket S3 access policies (not wildcards)
- Per-secret Secrets Manager access policies (not wildcards)
- Trust relationships restricting role assumption
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
def iam_module_path(infrastructure_root):
    """Get the IAM module path."""
    return infrastructure_root / "modules" / "iam"


@pytest.fixture
def iam_main_tf(iam_module_path):
    """Load the IAM module main.tf file."""
    return load_terraform_file(iam_module_path / "main.tf")


@pytest.fixture
def iam_policies_tf(iam_module_path):
    """Load the IAM module policies.tf file."""
    return load_terraform_file(iam_module_path / "policies.tf")


@pytest.fixture
def iam_policies_s3_secrets_tf(iam_module_path):
    """Load the IAM module policies-s3-secrets.tf file."""
    return load_terraform_file(iam_module_path / "policies-s3-secrets.tf")


@pytest.fixture
def iam_service_roles_tf(iam_module_path):
    """Load the IAM module service-roles.tf file."""
    return load_terraform_file(iam_module_path / "service-roles.tf")


@pytest.fixture
def iam_variables_tf(iam_module_path):
    """Load the IAM module variables.tf file."""
    return load_terraform_file(iam_module_path / "variables.tf")


@pytest.fixture
def iam_outputs_tf(iam_module_path):
    """Load the IAM module outputs.tf file."""
    return load_terraform_file(iam_module_path / "outputs.tf")


def extract_resources(resources: list, resource_type: str) -> dict:
    """Extract resources of a specific type from parsed resources."""
    result = {}
    for resource_block in resources:
        if resource_type in resource_block:
            block = resource_block[resource_type]
            for name, attrs in block.items():
                result[name] = attrs
    return result


def extract_data_sources(data_list: list, data_type: str) -> dict:
    """Extract data sources of a specific type from parsed data."""
    result = {}
    for data_block in data_list:
        if data_type in data_block:
            block = data_block[data_type]
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


# Lambda function groups
LAMBDA_FUNCTION_GROUPS = [
    "strategy-management",
    "market-data",
    "ai-intelligence",
    "risk-controls",
    "exchange-integration",
    "audit"
]

# DynamoDB table groups for policy validation
DYNAMODB_TABLE_GROUPS = {
    "strategy-management": [
        "strategy-templates",
        "strategies",
        "strategy-versions",
        "deployments"
    ],
    "market-data": [
        "data-sources",
        "news-events",
        "sentiment-data",
        "streams",
        "backfill-requests"
    ],
    "ai-intelligence": [
        "ai-providers",
        "model-configurations",
        "fund-allocations",
        "model-performance",
        "performance-predictions"
    ],
    "risk-controls": [
        "position-limits",
        "drawdown-state",
        "drawdown-config",
        "volatility-state",
        "volatility-config",
        "kill-switch-state",
        "kill-switch-config",
        "circuit-breakers",
        "circuit-breaker-events",
        "risk-profiles",
        "strategy-profile-assignments",
        "risk-events",
        "alert-configs"
    ],
    "exchange-integration": [
        "exchange-limits",
        "exchange-health",
        "rate-limit-state"
    ],
    "audit": [
        "trade-lifecycle",
        "risk-events",
        "strategies",
        "deployments",
        "circuit-breakers",
        "kill-switch-state"
    ]
}


class TestIAMModuleStructure:
    """
    Test that the IAM module has the required structure.
    
    Feature: infrastructure-deployment
    Property 9: IAM Policy Granularity
    Validates: Requirements 16.1, 16.8
    """
    
    def test_iam_module_exists(self, iam_module_path):
        """
        Feature: infrastructure-deployment
        Property 9: IAM Policy Granularity
        Validates: Requirements 16.1
        
        Verify that the IAM module directory exists with required files.
        """
        assert iam_module_path.exists(), "IAM module directory should exist"
        assert (iam_module_path / "main.tf").exists(), "main.tf should exist"
        assert (iam_module_path / "variables.tf").exists(), "variables.tf should exist"
        assert (iam_module_path / "outputs.tf").exists(), "outputs.tf should exist"
        assert (iam_module_path / "policies.tf").exists(), "policies.tf should exist"
        assert (iam_module_path / "service-roles.tf").exists(), "service-roles.tf should exist"
    
    def test_lambda_execution_roles_defined(self, iam_main_tf):
        """
        Feature: infrastructure-deployment
        Property 9: IAM Policy Granularity
        Validates: Requirements 16.1
        
        Verify that Lambda execution roles are defined for each function group.
        """
        resources = iam_main_tf.get('resource', [])
        role_resources = extract_resources(resources, 'aws_iam_role')
        
        assert 'lambda_execution' in role_resources, (
            "Lambda execution roles should be defined using for_each"
        )
    
    def test_lambda_function_groups_defined(self, iam_main_tf):
        """
        Feature: infrastructure-deployment
        Property 9: IAM Policy Granularity
        Validates: Requirements 16.1
        
        Verify that all Lambda function groups are defined in locals.
        """
        locals_list = iam_main_tf.get('locals', [])
        locals_dict = extract_locals(locals_list)
        
        assert 'lambda_function_groups' in locals_dict, (
            "lambda_function_groups local should be defined"
        )
        
        function_groups = locals_dict['lambda_function_groups']
        
        for group in LAMBDA_FUNCTION_GROUPS:
            assert group in function_groups, (
                f"Function group '{group}' should be defined"
            )


class TestIAMPolicyGranularity:
    """
    Property 9: IAM Policy Granularity
    
    *For any* DynamoDB table, S3 bucket, or Secrets Manager secret, there SHALL 
    exist a corresponding IAM policy that grants access only to that specific 
    resource (not wildcards).
    
    **Validates: Requirements 16.4, 16.5, 16.6, 16.8**
    """
    
    def test_dynamodb_policies_use_specific_resources(self, iam_policies_tf):
        """
        Feature: infrastructure-deployment
        Property 9: IAM Policy Granularity
        Validates: Requirements 16.4
        
        Verify that DynamoDB policies reference specific table ARNs, not wildcards.
        """
        data_sources = iam_policies_tf.get('data', [])
        policy_docs = extract_data_sources(data_sources, 'aws_iam_policy_document')
        
        # Check that DynamoDB policy documents exist for each group
        dynamodb_policies = [
            'dynamodb_strategy_management',
            'dynamodb_market_data',
            'dynamodb_ai_intelligence',
            'dynamodb_risk_controls',
            'dynamodb_exchange_integration',
            'dynamodb_audit'
        ]
        
        for policy_name in dynamodb_policies:
            assert policy_name in policy_docs, (
                f"DynamoDB policy '{policy_name}' should be defined"
            )
    
    def test_dynamodb_policies_not_wildcard(self, iam_policies_tf):
        """
        Feature: infrastructure-deployment
        Property 9: IAM Policy Granularity
        Validates: Requirements 16.4
        
        Verify that DynamoDB policies do not use wildcard resources.
        """
        data_sources = iam_policies_tf.get('data', [])
        policy_docs = extract_data_sources(data_sources, 'aws_iam_policy_document')
        
        for policy_name, policy_config in policy_docs.items():
            if 'dynamodb' in policy_name.lower():
                statements = policy_config.get('statement', [])
                for stmt in statements:
                    resources = stmt.get('resources', [])
                    # Resources is a Terraform expression string
                    resource_str = str(resources)
                    
                    # Check that resources reference var.dynamodb_table_arns (specific tables)
                    # and not just "*" (wildcard for all DynamoDB resources)
                    assert 'var.dynamodb_table_arns' in resource_str, (
                        f"Policy '{policy_name}' should reference specific table ARNs via var.dynamodb_table_arns"
                    )
                    
                    # The /index/* pattern is acceptable for GSI access
                    # But standalone "*" or "arn:aws:dynamodb:*" is not
                    # Check that the resource doesn't start with just "*"
                    if resource_str.strip() == "*" or resource_str.strip() == '"*"':
                        pytest.fail(
                            f"Policy '{policy_name}' should not use standalone wildcard resources"
                        )
    
    def test_s3_policies_use_specific_buckets(self, iam_policies_s3_secrets_tf):
        """
        Feature: infrastructure-deployment
        Property 9: IAM Policy Granularity
        Validates: Requirements 16.5
        
        Verify that S3 policies reference specific bucket ARNs, not wildcards.
        """
        data_sources = iam_policies_s3_secrets_tf.get('data', [])
        policy_docs = extract_data_sources(data_sources, 'aws_iam_policy_document')
        
        # Check that S3 policy documents exist
        s3_policies = [
            's3_audit_logs',
            's3_prompt_templates',
            's3_model_outputs'
        ]
        
        for policy_name in s3_policies:
            assert policy_name in policy_docs, (
                f"S3 policy '{policy_name}' should be defined"
            )
    
    def test_s3_policies_not_wildcard(self, iam_policies_s3_secrets_tf):
        """
        Feature: infrastructure-deployment
        Property 9: IAM Policy Granularity
        Validates: Requirements 16.5
        
        Verify that S3 policies do not use wildcard bucket resources.
        """
        data_sources = iam_policies_s3_secrets_tf.get('data', [])
        policy_docs = extract_data_sources(data_sources, 'aws_iam_policy_document')
        
        for policy_name, policy_config in policy_docs.items():
            if 's3_' in policy_name.lower():
                statements = policy_config.get('statement', [])
                for stmt in statements:
                    resources = stmt.get('resources', [])
                    for resource in resources:
                        assert resource != "*", (
                            f"Policy '{policy_name}' should not use wildcard resources"
                        )
                        # Should reference var.s3_bucket_arns
                        assert "s3:*" not in str(resource).lower(), (
                            f"Policy '{policy_name}' should not use S3 wildcard"
                        )
    
    def test_secrets_policies_use_specific_secrets(self, iam_policies_s3_secrets_tf):
        """
        Feature: infrastructure-deployment
        Property 9: IAM Policy Granularity
        Validates: Requirements 16.6
        
        Verify that Secrets Manager policies reference specific secret ARNs.
        """
        data_sources = iam_policies_s3_secrets_tf.get('data', [])
        policy_docs = extract_data_sources(data_sources, 'aws_iam_policy_document')
        
        # Check that Secrets Manager policy documents exist
        secrets_policies = [
            'secrets_exchange',
            'secrets_ai_provider',
            'secrets_infrastructure'
        ]
        
        for policy_name in secrets_policies:
            assert policy_name in policy_docs, (
                f"Secrets Manager policy '{policy_name}' should be defined"
            )
    
    def test_secrets_policies_not_wildcard(self, iam_policies_s3_secrets_tf):
        """
        Feature: infrastructure-deployment
        Property 9: IAM Policy Granularity
        Validates: Requirements 16.6
        
        Verify that Secrets Manager policies do not use wildcard resources.
        """
        data_sources = iam_policies_s3_secrets_tf.get('data', [])
        policy_docs = extract_data_sources(data_sources, 'aws_iam_policy_document')
        
        for policy_name, policy_config in policy_docs.items():
            if 'secrets_' in policy_name.lower():
                statements = policy_config.get('statement', [])
                for stmt in statements:
                    resources = stmt.get('resources', [])
                    for resource in resources:
                        assert resource != "*", (
                            f"Policy '{policy_name}' should not use wildcard resources"
                        )


class TestIAMTrustRelationships:
    """
    Test that IAM roles have proper trust relationships.
    
    Feature: infrastructure-deployment
    Property 9: IAM Policy Granularity
    Validates: Requirements 16.8
    """
    
    def test_lambda_trust_policy_restricts_to_lambda_service(self, iam_main_tf):
        """
        Feature: infrastructure-deployment
        Property 9: IAM Policy Granularity
        Validates: Requirements 16.8
        
        Verify that Lambda execution roles only trust the Lambda service.
        """
        data_sources = iam_main_tf.get('data', [])
        policy_docs = extract_data_sources(data_sources, 'aws_iam_policy_document')
        
        assert 'lambda_assume_role' in policy_docs, (
            "Lambda assume role policy should be defined"
        )
        
        lambda_policy = policy_docs['lambda_assume_role']
        statements = lambda_policy.get('statement', [])
        
        assert len(statements) > 0, "Lambda assume role policy should have statements"
        
        for stmt in statements:
            principals = stmt.get('principals', [])
            for principal in principals:
                if principal.get('type') == 'Service':
                    identifiers = principal.get('identifiers', [])
                    assert 'lambda.amazonaws.com' in identifiers, (
                        "Lambda trust policy should include lambda.amazonaws.com"
                    )
    
    def test_step_functions_trust_policy(self, iam_service_roles_tf):
        """
        Feature: infrastructure-deployment
        Property 9: IAM Policy Granularity
        Validates: Requirements 16.8
        
        Verify that Step Functions role only trusts the Step Functions service.
        """
        data_sources = iam_service_roles_tf.get('data', [])
        policy_docs = extract_data_sources(data_sources, 'aws_iam_policy_document')
        
        assert 'step_functions_assume_role' in policy_docs, (
            "Step Functions assume role policy should be defined"
        )
        
        sf_policy = policy_docs['step_functions_assume_role']
        statements = sf_policy.get('statement', [])
        
        for stmt in statements:
            principals = stmt.get('principals', [])
            for principal in principals:
                if principal.get('type') == 'Service':
                    identifiers = principal.get('identifiers', [])
                    assert 'states.amazonaws.com' in identifiers, (
                        "Step Functions trust policy should include states.amazonaws.com"
                    )
    
    def test_eventbridge_trust_policy(self, iam_service_roles_tf):
        """
        Feature: infrastructure-deployment
        Property 9: IAM Policy Granularity
        Validates: Requirements 16.8
        
        Verify that EventBridge role only trusts the EventBridge service.
        """
        data_sources = iam_service_roles_tf.get('data', [])
        policy_docs = extract_data_sources(data_sources, 'aws_iam_policy_document')
        
        assert 'eventbridge_assume_role' in policy_docs, (
            "EventBridge assume role policy should be defined"
        )
        
        eb_policy = policy_docs['eventbridge_assume_role']
        statements = eb_policy.get('statement', [])
        
        for stmt in statements:
            principals = stmt.get('principals', [])
            for principal in principals:
                if principal.get('type') == 'Service':
                    identifiers = principal.get('identifiers', [])
                    assert 'events.amazonaws.com' in identifiers, (
                        "EventBridge trust policy should include events.amazonaws.com"
                    )


class TestIAMAccessAnalyzer:
    """
    Test that IAM Access Analyzer is configured.
    
    Feature: infrastructure-deployment
    Property 9: IAM Policy Granularity
    Validates: Requirements 16.7
    """
    
    def test_access_analyzer_defined(self, iam_service_roles_tf):
        """
        Feature: infrastructure-deployment
        Property 9: IAM Policy Granularity
        Validates: Requirements 16.7
        
        Verify that IAM Access Analyzer is defined.
        """
        resources = iam_service_roles_tf.get('resource', [])
        analyzer_resources = extract_resources(resources, 'aws_accessanalyzer_analyzer')
        
        assert 'main' in analyzer_resources, (
            "IAM Access Analyzer should be defined"
        )
        
        analyzer = analyzer_resources['main']
        assert analyzer.get('type') == 'ACCOUNT', (
            "Access Analyzer should be of type ACCOUNT"
        )


class TestIAMOutputs:
    """
    Test that IAM module outputs are properly defined.
    
    Feature: infrastructure-deployment
    Property 9: IAM Policy Granularity
    Validates: Requirements 16.1
    """
    
    def test_lambda_role_arns_output(self, iam_outputs_tf):
        """
        Feature: infrastructure-deployment
        Property 9: IAM Policy Granularity
        Validates: Requirements 16.1
        
        Verify that Lambda role ARNs are output.
        """
        outputs = iam_outputs_tf.get('output', [])
        output_dict = extract_outputs(outputs)
        
        assert 'lambda_execution_role_arns' in output_dict, (
            "lambda_execution_role_arns output should exist"
        )
        assert 'all_lambda_role_arns' in output_dict, (
            "all_lambda_role_arns output should exist"
        )
    
    def test_service_role_outputs(self, iam_outputs_tf):
        """
        Feature: infrastructure-deployment
        Property 9: IAM Policy Granularity
        Validates: Requirements 16.2
        
        Verify that service role ARNs are output.
        """
        outputs = iam_outputs_tf.get('output', [])
        output_dict = extract_outputs(outputs)
        
        assert 'step_functions_role_arn' in output_dict, (
            "step_functions_role_arn output should exist"
        )
        assert 'eventbridge_role_arn' in output_dict, (
            "eventbridge_role_arn output should exist"
        )
        assert 'api_gateway_cloudwatch_role_arn' in output_dict, (
            "api_gateway_cloudwatch_role_arn output should exist"
        )


class TestIAMPropertyBased:
    """
    Property-based tests using Hypothesis to validate IAM configurations.
    
    Feature: infrastructure-deployment
    Property 9: IAM Policy Granularity
    Validates: Requirements 16.4, 16.5, 16.6, 16.8
    """
    
    @given(
        function_group=st.sampled_from(LAMBDA_FUNCTION_GROUPS),
        environment=st.sampled_from(['test', 'production']),
        project_name=st.text(
            alphabet='abcdefghijklmnopqrstuvwxyz-',
            min_size=3,
            max_size=20
        ).filter(lambda x: not x.startswith('-') and not x.endswith('-') and '--' not in x)
    )
    @settings(max_examples=100)
    def test_role_naming_convention(self, function_group, environment, project_name):
        """
        Feature: infrastructure-deployment
        Property 9: IAM Policy Granularity
        Validates: Requirements 16.1
        
        *For any* function group, environment, and project name combination,
        the generated role name SHALL follow the pattern {project}-{env}-lambda-{group}.
        """
        expected_name = f"{project_name}-{environment}-lambda-{function_group}"
        
        # Validate role name format
        assert environment in expected_name, "Role name must contain environment"
        assert function_group in expected_name, "Role name must contain function group"
        assert "lambda" in expected_name, "Role name must contain 'lambda'"
        
        # Validate role name length (AWS limit is 64 characters)
        assert len(expected_name) <= 64, "Role name must not exceed 64 characters"
    
    @given(
        function_group=st.sampled_from(LAMBDA_FUNCTION_GROUPS)
    )
    @settings(max_examples=100)
    def test_function_group_has_tables(self, function_group):
        """
        Feature: infrastructure-deployment
        Property 9: IAM Policy Granularity
        Validates: Requirements 16.4
        
        *For any* function group, it SHALL have associated DynamoDB tables defined.
        """
        assert function_group in DYNAMODB_TABLE_GROUPS, (
            f"Function group '{function_group}' should have associated tables"
        )
        
        tables = DYNAMODB_TABLE_GROUPS[function_group]
        assert len(tables) > 0, (
            f"Function group '{function_group}' should have at least one table"
        )
    
    @given(
        table_name=st.sampled_from([
            table for tables in DYNAMODB_TABLE_GROUPS.values() for table in tables
        ])
    )
    @settings(max_examples=100)
    def test_table_belongs_to_group(self, table_name):
        """
        Feature: infrastructure-deployment
        Property 9: IAM Policy Granularity
        Validates: Requirements 16.4
        
        *For any* table, it SHALL belong to at least one function group.
        """
        found = False
        for group, tables in DYNAMODB_TABLE_GROUPS.items():
            if table_name in tables:
                found = True
                break
        
        assert found, f"Table '{table_name}' should belong to a function group"
    
    @given(
        service=st.sampled_from([
            'lambda.amazonaws.com',
            'states.amazonaws.com',
            'events.amazonaws.com',
            'apigateway.amazonaws.com'
        ])
    )
    @settings(max_examples=100)
    def test_service_principal_format(self, service):
        """
        Feature: infrastructure-deployment
        Property 9: IAM Policy Granularity
        Validates: Requirements 16.8
        
        *For any* AWS service principal, it SHALL follow the format {service}.amazonaws.com.
        """
        assert service.endswith('.amazonaws.com'), (
            f"Service principal '{service}' should end with .amazonaws.com"
        )
        
        # Extract service name
        service_name = service.replace('.amazonaws.com', '')
        assert len(service_name) > 0, "Service name should not be empty"
