import { Construct } from 'constructs';
import {
  Stack, StackProps, Duration,
} from 'aws-cdk-lib';
import {
  ContainerImage, LogDriver, Secret
} from 'aws-cdk-lib/aws-ecs';
import { ApplicationLoadBalancedFargateService } from 'aws-cdk-lib/aws-ecs-patterns';
import { Vpc, SubnetType } from 'aws-cdk-lib/aws-ec2';
import { DockerImageAsset, Platform } from 'aws-cdk-lib/aws-ecr-assets';
import { TableV2 } from 'aws-cdk-lib/aws-dynamodb';
import { Secret as SecretsManager } from 'aws-cdk-lib/aws-secretsmanager';
import { Certificate } from 'aws-cdk-lib/aws-certificatemanager';
import { HostedZone } from 'aws-cdk-lib/aws-route53';

const CONTAINER_MEMORY_MIB = 6144;

interface KarabastDevStackProps extends StackProps {
  ddbTable: TableV2;
}

export class KarabastDevStack extends Stack {
  constructor(scope: Construct, id: string, props: KarabastDevStackProps) {
    super(scope, id, props);

    const image = new DockerImageAsset(this, 'KarabastDevImage', {
      directory: '../forceteki',
      platform: Platform.LINUX_AMD64,
      buildArgs: {
        BUILDX_NO_DEFAULT_ATTESTATIONS: '1',
      },
    });

    const secrets = SecretsManager.fromSecretNameV2(this, 'KarabastSecrets', 'karabast-secrets');

    const vpc = new Vpc(this, 'KarabastDevVpc', {
      maxAzs: 2,
      natGateways: 0,
    });

    // Import Route53 hosted zone
    const hostedZone = HostedZone.fromLookup(this, 'KarabastZone', {
      domainName: 'karabast.net',
    });

    const certificate = Certificate.fromCertificateArn(
      this,
      'KarabastCertificate',
      'arn:aws:acm:us-east-1:182399701650:certificate/a9f6ff31-2efe-44ce-83f8-6da9cdf6b111'
    );

    const fargateService = new ApplicationLoadBalancedFargateService(this, 'KarabastDevService', {
      vpc,
      cpu: 2048,
      memoryLimitMiB: CONTAINER_MEMORY_MIB,
      desiredCount: 1,
      taskImageOptions: {
        image: ContainerImage.fromDockerImageAsset(image),
        containerPort: 9500,
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
          SWUBASE_CLIENT_ID: Secret.fromSecretsManager(secrets, 'SWUBASE_CLIENT_ID'),
                    SWUBASE_CLIENT_SECRET: Secret.fromSecretsManager(secrets, 'SWUBASE_CLIENT_SECRET'),
        },
        environment: {
          AWS_NODEJS_CONNECTION_REUSE_ENABLED: '1',
          NODE_OPTIONS: `--max-old-space-size=${CONTAINER_MEMORY_MIB - 1024} --max-semi-space-size=128`,
          ADDITIONAL_CORS_ORIGINS: 'https://dev.karabast.net'
        },
        logDriver: LogDriver.awsLogs({ streamPrefix: 'KarabastDev' }),
      },
      assignPublicIp: true,
      taskSubnets: { subnetType: SubnetType.PUBLIC },
      domainName: 'api-dev.karabast.net',
      domainZone: hostedZone,
      certificate,
      redirectHTTP: true,
    });

    secrets.grantRead(fargateService.taskDefinition.taskRole);
    props.ddbTable.grantReadWriteData(fargateService.taskDefinition.taskRole);

    // Customize health check - lenient settings for startup time
    fargateService.targetGroup.configureHealthCheck({
      path: '/api/health',
      interval: Duration.seconds(60),
      timeout: Duration.seconds(10),
      healthyThresholdCount: 2,
      unhealthyThresholdCount: 5,
    });
  }
}
