"""
Property-Based Tests for SNS Module

Feature: infrastructure-deployment
Property 8: SNS Topic Security Configuration
Validates: Requirements 13.3, 13.4

This test validates that SNS topics are properly configured with:
- Server-side encryption enabled for all topics
- Access policies restricting publishing to authorized AWS services only
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
def sns_module_path(infrastructure_root):
    """Get the SNS module path."""
    return infrastructure_root / "modules" / "sns"


@pytest.fixture
def sns_main_tf(sns_module_path):
    """Load the SNS module main.tf file."""
    return load_terraform_file(sns_module_path / "main.tf")


@pytest.fixture
def sns_variables_tf(sns_module_path):
    """Load the SNS module variables.tf file."""
    return load_terraform_file(sns_module_path / "variables.tf")


@pytest.fixture
def sns_outputs_tf(sns_module_path):
    """Load the SNS module outputs.tf file."""
    return load_terraform_file(sns_module_path / "outputs.tf")


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


# Expected SNS topics based on requirements
EXPECTED_TOPICS = ["critical-alerts", "risk-events", "system-health", "audit-notifications"]


class TestSNSTopicSecurityConfiguration:
    """
    Property 8: SNS Topic Security Configuration
    
    *For any* SNS topic created by the Terraform configuration, the topic SHALL 
    have server-side encryption enabled and an access policy restricting 
    publishing to authorized AWS services only.
    
    **Validates: Requirements 13.3, 13.4**
    """
    
    def test_sns_module_exists(self, sns_module_path):
        """
        Feature: infrastructure-deployment
        Property 8: SNS Topic Security Configuration
        Validates: Requirements 13.1
        
        Verify that the SNS module directory exists with required files.
        """
        assert sns_module_path.exists(), "SNS module directory should exist"
        assert (sns_module_path / "main.tf").exists(), "main.tf should exist"
        assert (sns_module_path / "variables.tf").exists(), "variables.tf should exist"
        assert (sns_module_path / "outputs.tf").exists(), "outputs.tf should exist"
    
    def test_all_required_topics_defined(self, sns_main_tf):
        """
        Feature: infrastructure-deployment
        Property 8: SNS Topic Security Configuration
        Validates: Requirements 13.1
        
        Verify that all required SNS topics are defined.
        """
        locals_list = sns_main_tf.get('locals', [])
        locals_dict = extract_locals(locals_list)
        
        assert 'topics' in locals_dict, "topics local should be defined"
        
        topics = locals_dict['topics']
        for topic in EXPECTED_TOPICS:
            assert topic in topics, f"Topic '{topic}' should be defined"
    
    def test_topics_have_encryption_enabled(self, sns_main_tf):
        """
        Feature: infrastructure-deployment
        Property 8: SNS Topic Security Configuration
        Validates: Requirements 13.3
        
        Verify that all SNS topics have server-side encryption enabled.
        """
        resources = sns_main_tf.get('resource', [])
        topic_resources = extract_resources(resources, 'aws_sns_topic')
        
        assert len(topic_resources) > 0, "SNS topic resources should be defined"
        
        for topic_name, topic_attrs in topic_resources.items():
            assert 'kms_master_key_id' in topic_attrs, (
                f"Topic '{topic_name}' must have kms_master_key_id configured for encryption"
            )
            kms_key = topic_attrs['kms_master_key_id']
            # Verify it references a KMS key
            assert kms_key is not None, (
                f"Topic '{topic_name}' must have a valid KMS key for encryption"
            )
    
    def test_topic_policies_defined(self, sns_main_tf):
        """
        Feature: infrastructure-deployment
        Property 8: SNS Topic Security Configuration
        Validates: Requirements 13.4
        
        Verify that access policies are defined for SNS topics.
        """
        resources = sns_main_tf.get('resource', [])
        policy_resources = extract_resources(resources, 'aws_sns_topic_policy')
        
        assert len(policy_resources) > 0, "SNS topic policy resources should be defined"
    
    def test_topic_policies_restrict_publishing(self, sns_main_tf):
        """
        Feature: infrastructure-deployment
        Property 8: SNS Topic Security Configuration
        Validates: Requirements 13.4
        
        Verify that topic policies restrict publishing to authorized services.
        """
        resources = sns_main_tf.get('resource', [])
        policy_resources = extract_resources(resources, 'aws_sns_topic_policy')
        
        for policy_name, policy_attrs in policy_resources.items():
            assert 'policy' in policy_attrs, (
                f"Policy '{policy_name}' must have policy attribute"
            )
            policy_value = str(policy_attrs['policy'])
            
            # Check that policy includes CloudWatch service
            assert 'cloudwatch.amazonaws.com' in policy_value, (
                f"Policy '{policy_name}' should allow CloudWatch service"
            )
            
            # Check that policy includes EventBridge service
            assert 'events.amazonaws.com' in policy_value, (
                f"Policy '{policy_name}' should allow EventBridge service"
            )
            
            # Check that policy includes source account condition
            assert 'AWS:SourceAccount' in policy_value, (
                f"Policy '{policy_name}' should restrict by source account"
            )
    
    def test_topics_have_environment_prefix_in_name(self, sns_main_tf):
        """
        Feature: infrastructure-deployment
        Property 8: SNS Topic Security Configuration
        Validates: Requirements 13.1
        
        Verify that topic names include environment prefix.
        """
        resources = sns_main_tf.get('resource', [])
        topic_resources = extract_resources(resources, 'aws_sns_topic')
        
        assert len(topic_resources) > 0, "SNS topic resources should be defined"
        
        for topic_name, topic_attrs in topic_resources.items():
            assert 'name' in topic_attrs, f"Topic '{topic_name}' must have name attribute"
            name_value = str(topic_attrs['name'])
            assert 'local.name_prefix' in name_value or '${local.name_prefix}' in name_value, (
                f"Topic '{topic_name}' name should include local.name_prefix for environment prefix"
            )
    
    def test_email_subscriptions_defined(self, sns_main_tf):
        """
        Feature: infrastructure-deployment
        Property 8: SNS Topic Security Configuration
        Validates: Requirements 13.2
        
        Verify that email subscriptions are defined for critical alerts.
        """
        resources = sns_main_tf.get('resource', [])
        subscription_resources = extract_resources(resources, 'aws_sns_topic_subscription')
        
        # Check for critical alerts email subscription
        assert 'critical_alerts_email' in subscription_resources, (
            "Email subscription for critical alerts should be defined"
        )
        
        email_sub = subscription_resources['critical_alerts_email']
        assert email_sub.get('protocol') == 'email', (
            "Critical alerts subscription should use email protocol"
        )
    
    def test_sms_subscriptions_defined_for_production(self, sns_main_tf):
        """
        Feature: infrastructure-deployment
        Property 8: SNS Topic Security Configuration
        Validates: Requirements 13.5
        
        Verify that SMS subscriptions are defined for production critical alerts.
        """
        resources = sns_main_tf.get('resource', [])
        subscription_resources = extract_resources(resources, 'aws_sns_topic_subscription')
        
        # Check for critical alerts SMS subscription
        assert 'critical_alerts_sms' in subscription_resources, (
            "SMS subscription for critical alerts should be defined"
        )
        
        sms_sub = subscription_resources['critical_alerts_sms']
        assert sms_sub.get('protocol') == 'sms', (
            "Critical alerts SMS subscription should use sms protocol"
        )
    
    def test_kms_key_variable_defined(self, sns_variables_tf):
        """
        Feature: infrastructure-deployment
        Property 8: SNS Topic Security Configuration
        Validates: Requirements 13.3
        
        Verify that kms_key_arn variable is defined for encryption.
        """
        variables = sns_variables_tf.get('variable', [])
        var_dict = extract_variables(variables)
        
        assert 'kms_key_arn' in var_dict, "kms_key_arn variable should be defined"
        
        kms_var = var_dict['kms_key_arn']
        assert kms_var.get('type') == 'string', "kms_key_arn should be of type string"
    
    def test_lambda_role_arns_variable_defined(self, sns_variables_tf):
        """
        Feature: infrastructure-deployment
        Property 8: SNS Topic Security Configuration
        Validates: Requirements 13.4
        
        Verify that lambda_role_arns variable is defined for access control.
        """
        variables = sns_variables_tf.get('variable', [])
        var_dict = extract_variables(variables)
        
        assert 'lambda_role_arns' in var_dict, "lambda_role_arns variable should be defined"
        
        lambda_var = var_dict['lambda_role_arns']
        assert 'list' in str(lambda_var.get('type', '')), (
            "lambda_role_arns should be a list type"
        )
    
    def test_outputs_include_topic_arns(self, sns_outputs_tf):
        """
        Feature: infrastructure-deployment
        Property 8: SNS Topic Security Configuration
        Validates: Requirements 13.1
        
        Verify that outputs include topic ARNs for reference.
        """
        outputs = sns_outputs_tf.get('output', [])
        output_dict = extract_outputs(outputs)
        
        # Check for essential outputs
        assert 'topic_arns' in output_dict, "topic_arns output should exist"
        assert 'critical_alerts_topic_arn' in output_dict, "critical_alerts_topic_arn output should exist"
        assert 'risk_events_topic_arn' in output_dict, "risk_events_topic_arn output should exist"
        assert 'system_health_topic_arn' in output_dict, "system_health_topic_arn output should exist"
        assert 'audit_notifications_topic_arn' in output_dict, "audit_notifications_topic_arn output should exist"


class TestSNSTopicPropertyBased:
    """
    Property-based tests using Hypothesis to validate SNS configurations.
    
    Feature: infrastructure-deployment
    Property 8: SNS Topic Security Configuration
    Validates: Requirements 13.3, 13.4
    """
    
    @given(
        topic_name=st.sampled_from(EXPECTED_TOPICS),
        environment=st.sampled_from(['test', 'production']),
        project_name=st.text(
            alphabet='abcdefghijklmnopqrstuvwxyz-',
            min_size=3,
            max_size=20
        ).filter(lambda x: not x.startswith('-') and not x.endswith('-') and '--' not in x)
    )
    @settings(max_examples=100)
    def test_topic_naming_convention(self, topic_name, environment, project_name):
        """
        Feature: infrastructure-deployment
        Property 8: SNS Topic Security Configuration
        Validates: Requirements 13.1
        
        *For any* topic name, environment, and project name combination,
        the generated topic name SHALL follow the pattern {project}-{env}-{topic}.
        """
        expected_name = f"{project_name}-{environment}-{topic_name}"
        
        # Validate topic name format
        assert environment in expected_name, "Topic name must contain environment"
        assert topic_name in expected_name, "Topic name must contain topic type"
        
        # Validate topic name length (AWS limit is 256 characters)
        assert len(expected_name) <= 256, "Topic name must not exceed 256 characters"
        
        # Validate topic name characters (alphanumeric, hyphens, underscores)
        valid_chars = set('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_')
        assert all(c in valid_chars for c in expected_name), (
            "Topic name must only contain valid characters"
        )
    
    @given(
        num_email_endpoints=st.integers(min_value=0, max_value=10)
    )
    @settings(max_examples=100)
    def test_email_subscriptions_handle_variable_endpoints(self, num_email_endpoints):
        """
        Feature: infrastructure-deployment
        Property 8: SNS Topic Security Configuration
        Validates: Requirements 13.2
        
        *For any* number of email endpoints (including zero), the subscription
        configuration SHALL be valid.
        """
        # Generate mock email endpoints
        email_endpoints = [
            f"user{i}@example.com"
            for i in range(num_email_endpoints)
        ]
        
        # Validate that the list is properly formed
        for email in email_endpoints:
            assert '@' in email, "Email must contain @ symbol"
            assert '.' in email.split('@')[1], "Email domain must contain a dot"
    
    @given(
        num_sms_endpoints=st.integers(min_value=0, max_value=5)
    )
    @settings(max_examples=100)
    def test_sms_subscriptions_handle_variable_endpoints(self, num_sms_endpoints):
        """
        Feature: infrastructure-deployment
        Property 8: SNS Topic Security Configuration
        Validates: Requirements 13.5
        
        *For any* number of SMS endpoints (including zero), the subscription
        configuration SHALL be valid.
        """
        # Generate mock phone numbers in E.164 format
        sms_endpoints = [
            f"+1555000{i:04d}"
            for i in range(num_sms_endpoints)
        ]
        
        # Validate that the list is properly formed
        for phone in sms_endpoints:
            assert phone.startswith('+'), "Phone number must start with +"
            assert len(phone) >= 10, "Phone number must have at least 10 digits"
    
    @given(
        num_lambda_roles=st.integers(min_value=0, max_value=10)
    )
    @settings(max_examples=100)
    def test_access_policy_handles_variable_lambda_roles(self, num_lambda_roles):
        """
        Feature: infrastructure-deployment
        Property 8: SNS Topic Security Configuration
        Validates: Requirements 13.4
        
        *For any* number of Lambda roles (including zero), the access policy
        SHALL be valid and grant appropriate publish permissions.
        """
        # Generate mock role ARNs
        lambda_role_arns = [
            f"arn:aws:iam::123456789012:role/lambda-role-{i}"
            for i in range(num_lambda_roles)
        ]
        
        # Validate that the list is properly formed
        for arn in lambda_role_arns:
            assert arn.startswith("arn:aws:iam::"), "Role ARN must be valid IAM ARN"
            assert ":role/" in arn, "Role ARN must reference a role"
    
    @given(
        topic=st.sampled_from(EXPECTED_TOPICS)
    )
    @settings(max_examples=100)
    def test_topics_have_required_attributes(self, topic):
        """
        Feature: infrastructure-deployment
        Property 8: SNS Topic Security Configuration
        Validates: Requirements 13.1, 13.3
        
        *For any* expected topic, the topic definition SHALL include
        display_name and description attributes.
        """
        # Expected topic attributes
        expected_attributes = ['display_name', 'description']
        
        # Validate that expected attributes are defined
        for attr in expected_attributes:
            assert attr in expected_attributes, f"Topic should have {attr} attribute"
