# Production Readiness Checklist

## Pre-Deployment Checks

### Infrastructure
- [ ] Terraform plan reviewed and approved
- [ ] All resources tagged appropriately
- [ ] VPC and security groups configured correctly
- [ ] IAM roles follow least privilege principle

### Backend
- [ ] All tests passing
- [ ] Code reviewed and approved
- [ ] No security vulnerabilities in dependencies
- [ ] Environment variables configured
- [ ] Secrets populated in Secrets Manager

### Frontend
- [ ] All tests passing
- [ ] Build successful
- [ ] Environment configuration correct
- [ ] Assets optimized

### Security
- [ ] SSL certificates valid (>30 days)
- [ ] API authentication configured
- [ ] CORS settings correct
- [ ] WAF rules in place (if applicable)

### Monitoring
- [ ] CloudWatch dashboards created
- [ ] Alarms configured for critical metrics
- [ ] SNS topics have subscriptions
- [ ] Log retention policies set

---

## Deployment Verification

### DNS & SSL
- [ ] DNS records resolving correctly
- [ ] SSL certificates valid
- [ ] HTTPS enforced

### API
- [ ] API Gateway responding
- [ ] All Lambda functions healthy
- [ ] Database connectivity verified

### Frontend
- [ ] CloudFront distribution enabled
- [ ] Frontend accessible
- [ ] Static assets loading

### End-to-End
- [ ] Smoke tests passing
- [ ] Critical user flows working
- [ ] Performance acceptable

---

## Post-Deployment

### Documentation
- [ ] Deployment summary generated
- [ ] Runbook updated
- [ ] Change log updated

### Communication
- [ ] Stakeholders notified
- [ ] Status page updated (if applicable)

### Monitoring
- [ ] Alarms in OK state
- [ ] No error spikes in logs
- [ ] Performance metrics normal

---

## Sign-Off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Developer | | | |
| Reviewer | | | |
| Operations | | | |
| Security | | | |

---

## Notes

_Add any deployment-specific notes here_

---

*Checklist version: 1.0*
*Last updated: 2026-01-04*
