import { Construct } from 'constructs';
import { Stack, StackProps } from 'aws-cdk-lib';
import { AttributeType, TableV2 } from 'aws-cdk-lib/aws-dynamodb';

/**
 * Contains the infra for the Karabast DynamoDB table.
 */
export class DynamoDbStack extends Stack {
  ddbTable: TableV2;
  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props);

    this.ddbTable = new TableV2(this, 'KarabastGlobalTable', {
      tableName: 'KarabastGlobalTable',
      partitionKey: { name: 'pk', type: AttributeType.STRING },
      sortKey: { name: 'sk', type: AttributeType.STRING }
    });
  }
}
