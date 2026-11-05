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

* Node.js v22 or later (the v26 that forceteki uses works too)
* AWS CDK CLI (`npm install -g aws-cdk`), or use `npx cdk` to run the version pinned in this repo
* AWS credentials configured

#### Useful commands

* `npm run build`   compile typescript to js
* `npm run watch`   watch for changes and compile
* `npm run test`    perform the jest unit tests
* `cdk deploy`      deploy this stack to your default AWS account/region
* `cdk diff`        compare deployed stack with current state
* `cdk synth`       emits the synthesized CloudFormation template

## Deploying

`cdk deploy` builds the server image from the sibling `../forceteki` checkout using that repo's `Dockerfile`. Dependencies are installed and the server is compiled inside Docker, so you don't need to run `npm install` or `npm run build` in forceteki first.

1. Start Docker Desktop.
2. Check out `../forceteki` at the commit you want to deploy.
3. Make sure `../forceteki/test/json` is current: run `npm run get-cards` there if `card-data-version.txt`, `fetchdata.js` or `mockdata.js` changed. The image build fails with a clear message if it's stale.
4. Run `cdk deploy KarabastDevStack` or `cdk deploy KarabastMainStack`.

To test the image locally before deploying, see "Production Docker Image" in the forceteki README.
