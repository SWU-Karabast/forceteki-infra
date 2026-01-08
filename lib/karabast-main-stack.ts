import { Construct } from 'constructs';
import {
  Stack, StackProps, Duration,
} from 'aws-cdk-lib';
import {
  Cluster, FargateService, FargateTaskDefinition, ContainerImage, LogDriver, Secret
} from 'aws-cdk-lib/aws-ecs';
import { Vpc, SubnetType, SecurityGroup, Port, Peer } from 'aws-cdk-lib/aws-ec2';
import { DockerImageAsset, Platform } from 'aws-cdk-lib/aws-ecr-assets';
import { TableV2 } from 'aws-cdk-lib/aws-dynamodb';
import { Secret as SecretsManager } from 'aws-cdk-lib/aws-secretsmanager';

const CONTAINER_MEMORY_MIB = 6144;

interface KarabastMainStackProps extends StackProps {
  ddbTable: TableV2;
}

export class KarabastMainStack extends Stack {
  constructor(scope: Construct, id: string, props: KarabastMainStackProps) {
    super(scope, id, props);

    const image = new DockerImageAsset(this, 'KarabastImage', {
      directory: '../forceteki',
      platform: Platform.LINUX_AMD64,
      buildArgs: {
        BUILDX_NO_DEFAULT_ATTESTATIONS: '1',
      },
    });

    const secrets = SecretsManager.fromSecretNameV2(this, 'KarabastSecrets', 'karabast-secrets');

    const vpc = new Vpc(this, 'KarabastVpc', {
      maxAzs: 2,
      natGateways: 0,
    });

    const cluster = new Cluster(this, 'KarabastCluster', {
      vpc,
    });

    const taskDef = new FargateTaskDefinition(this, 'KarabastTaskDef', {
      memoryLimitMiB: CONTAINER_MEMORY_MIB,
      cpu: 2048,
    });

    taskDef.addContainer('AppContainer', {
      image: ContainerImage.fromDockerImageAsset(image),
      portMappings: [
        {
          containerPort: 9500,
        },
      ],
      secrets: {
        AWS_ACCESS_KEY_ID: Secret.fromSecretsManager(secrets, 'AWS_ACCESS_KEY_ID'),
        AWS_SECRET_ACCESS_KEY: Secret.fromSecretsManager(secrets, 'AWS_SECRET_ACCESS_KEY'),
        NEXTAUTH_SECRET: Secret.fromSecretsManager(secrets, 'NEXTAUTH_SECRET'),
        GOOGLE_CLIENT_ID: Secret.fromSecretsManager(secrets, 'GOOGLE_CLIENT_ID'),
        GOOGLE_CLIENT_SECRET: Secret.fromSecretsManager(secrets, 'GOOGLE_CLIENT_SECRET'),
        DISCORD_CLIENT_ID: Secret.fromSecretsManager(secrets, 'DISCORD_CLIENT_ID'),
        DISCORD_CLIENT_SECRET: Secret.fromSecretsManager(secrets, 'DISCORD_CLIENT_SECRET'),
        DISCORD_BUG_REPORT_WEBHOOK_URL: Secret.fromSecretsManager(secrets, 'DISCORD_BUG_REPORT_WEBHOOK_URL'),
        DISCORD_ERROR_REPORT_WEBHOOK_URL: Secret.fromSecretsManager(secrets, 'DISCORD_ERROR_REPORT_WEBHOOK_URL'),
        DUMMY_SECRET: Secret.fromSecretsManager(secrets, 'DUMMY_SECRET'),
        SWUSTATS_API_KEY: Secret.fromSecretsManager(secrets, 'SWUSTATS_API_KEY'),
        SWUSTATS_CLIENT_ID: Secret.fromSecretsManager(secrets, 'SWUSTATS_CLIENT_ID'),
        SWUSTATS_CLIENT_SECRET: Secret.fromSecretsManager(secrets, 'SWUSTATS_CLIENT_SECRET'),
        INTRASERVICE_SECRET: Secret.fromSecretsManager(secrets, 'INTRASERVICE_SECRET'),
        PROFILE_CAPTURE_SECRET: Secret.fromSecretsManager(secrets, 'PROFILE_CAPTURE_SECRET'),
        DISCORD_PLAYER_REPORT_WEBHOOK_URL: Secret.fromSecretsManager(secrets, 'DISCORD_PLAYER_REPORT_WEBHOOK_URL'),
      },
      environment: {
        AWS_NODEJS_CONNECTION_REUSE_ENABLED: '1',

        // set max heap size for nodejs to be 1GB less than total container memory
        NODE_OPTIONS: `--max-old-space-size=${CONTAINER_MEMORY_MIB - 1024} --max-semi-space-size=128`,
      },
      logging: LogDriver.awsLogs({ streamPrefix: 'Karabast' }),
    });
    
    secrets.grantRead(taskDef.taskRole);

    const sg = new SecurityGroup(this, 'KarabastSG', {
      vpc,
      allowAllOutbound: true,
    });

    sg.addIngressRule(Peer.anyIpv4(), Port.tcp(80), 'Allow HTTP traffic');
    sg.addIngressRule(Peer.anyIpv4(), Port.tcp(443), 'Allow HTTPS traffic');

    const service = new FargateService(this, 'KarabastService', {
      cluster,
      taskDefinition: taskDef,
      assignPublicIp: true,
      desiredCount: 1,
      securityGroups: [sg],
      vpcSubnets: { subnetType: SubnetType.PUBLIC },
    });

    props.ddbTable.grantReadWriteData(taskDef.taskRole);
  }
}
