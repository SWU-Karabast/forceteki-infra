#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
// import { BackendStack } from '../lib/backend-stack';
import { DynamoDbStack } from '../lib/dynamo-db-stack';
import { KarabastMainStack } from '../lib/karabast-main-stack';

const app = new cdk.App();
const env = { account: '182399701650', region: 'us-east-1' }
const stackProps = { env }

const ddbStack = new DynamoDbStack(app, 'ForcetekiDynamoDbStack', stackProps)
// new BackendStack(app, 'ForcetekiInfraStack', { ddbTable: ddbStack.ddbTable, ...stackProps });
new KarabastMainStack(app, 'KarabastMainStack', { ddbTable: ddbStack.ddbTable, ...stackProps });

