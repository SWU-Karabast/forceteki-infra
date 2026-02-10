# Forceteki-infra

AWS CDK infrastructure for the [Karabast](https://karabast.net) Star Wars Unlimited online card game.

We have a [Discord server](https://discord.gg/N6ZgcZ3SfA) for updates, bug reports, and coordinating dev work.

## Related Repositories

* [forceteki](https://github.com/SWU-Karabast/forceteki) — Game engine and backend server
* [forceteki-client](https://github.com/SWU-Karabast/forceteki-client) — Web frontend

## Architecture

This project defines three AWS CloudFormation stacks via CDK:

* **KarabastMainStack** — Production ECS Fargate service behind an ALB (`api.karabast.net`)
* **KarabastDevStack** — Development ECS Fargate service (`api-dev.karabast.net`)
* **DynamoDbStack** — DynamoDB global table for data persistence

### Key AWS Services

* **ECS Fargate** — Containerized backend deployment
* **Application Load Balancer** — HTTPS termination and routing
* **DynamoDB** — NoSQL database
* **ECR** — Docker image storage
* **Route53** — DNS management
* **ACM** — SSL/TLS certificates
* **Secrets Manager** — Credentials and API keys

## Development

#### Required Software

* Node.js v22.x
* AWS CDK CLI (`npm install -g aws-cdk`)
* AWS credentials configured

#### Useful commands

* `npm run build`   compile typescript to js
* `npm run watch`   watch for changes and compile
* `npm run test`    perform the jest unit tests
* `cdk deploy`      deploy this stack to your default AWS account/region
* `cdk diff`        compare deployed stack with current state
* `cdk synth`       emits the synthesized CloudFormation template
