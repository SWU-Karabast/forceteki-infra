import { Construct } from 'constructs';
import { Stack, StackProps } from 'aws-cdk-lib';
import { DockerImageAsset, Platform } from 'aws-cdk-lib/aws-ecr-assets';
import { HostedZone, ARecord, RecordTarget } from 'aws-cdk-lib/aws-route53';
import { LoadBalancerTarget } from 'aws-cdk-lib/aws-route53-targets';
import { Certificate, CertificateValidation,  } from 'aws-cdk-lib/aws-certificatemanager';
import { ApplicationLoadBalancedFargateService } from 'aws-cdk-lib/aws-ecs-patterns';
import { Cluster, ContainerImage } from 'aws-cdk-lib/aws-ecs';
import { Vpc } from 'aws-cdk-lib/aws-ec2';
import { TableV2 } from 'aws-cdk-lib/aws-dynamodb';

interface BackendStackProps extends StackProps {
  ddbTable: TableV2
}

/**
 * Contains the infra for the Karabast server.
 */
export class BackendStack extends Stack {
  constructor(scope: Construct, id: string, props: BackendStackProps) {
    super(scope, id, props);

    const image = new DockerImageAsset(this, 'Image', {
        directory: '../forceteki',
        platform: Platform.LINUX_AMD64,
        buildArgs: {
            BUILDX_NO_DEFAULT_ATTESTATIONS: '1'
        },
    })
    const vpc = new Vpc(this, 'Vpc', {
      vpcName: 'karabast-vpc',
      maxAzs: 2,
      natGateways: 1,
    });

    const ecsCluster = new Cluster(this, 'EcsCluster', {
        vpc,
        clusterName: 'karabast-cluster',
    })

    const hostedZone = HostedZone.fromLookup(this, 'HostedZone', {
      domainName: 'beta.karabast.net',
    });

    const certificate = new Certificate(this, 'KarabastCertificate', {
      domainName: 'api.beta.karabast.net',
      validation: CertificateValidation.fromDns(hostedZone),
    });

    const service = new ApplicationLoadBalancedFargateService(this, "Service", {
      serviceName: 'karabast-service',
      loadBalancerName: 'karabast-alb',
      cluster: ecsCluster,
      memoryLimitMiB: 4096, // 4 GB
      cpu: 2048, // 2 vCPU
      taskImageOptions: {
          image: ContainerImage.fromDockerImageAsset(image),
          containerPort: 9500
      },
      desiredCount: 1,
      certificate: certificate,
      redirectHTTP: true,
    })

    service.targetGroup.configureHealthCheck({
      path: "/api/health",
      port: "9500",
    });

    new ARecord(this, 'KarabastApiRecord', {
      zone: hostedZone,
      recordName: 'api.beta.karabast.net',
      target: RecordTarget.fromAlias(new LoadBalancerTarget(service.loadBalancer)),
    });

    props.ddbTable.grantReadWriteData(service.taskDefinition.taskRole);
  }
}
