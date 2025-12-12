import {Teste} from "./teste.js"

export class DatamapTools {

    public async addDataFlow(name: string) {
        return `DataFlow '${name}' successfully created.`;
    }

    public async addDataLoad(name: string, description: string, loadOperation: string) {
        return `Dataload '${name}' created with description '${description}',  and load operation '${loadOperation}'.`;
    }

    public async unionOperation(name: string, description?: string) {
        const descText = description ? ` with description '${description}'` : '';
        return `Union operation '${name}'${descText} configured.`;
    }

    public async addjoinOperation(name: string, description: string, operation: any) {
        let joinTeste = new Teste();

        joinTeste.pushJoin(operation);

        return `Join successfully joined`;
    }

    public async deletejoinOperation(index?: number) {
        let joinTeste = new Teste();

        if(index){
            joinTeste.deleteJoinByIndex(index);
        }
        else {
            joinTeste.popLastJoin();
        }

        return `Join successfully removed`;
    }

    public async getInfo(){
        let joinTeste = new Teste();

        let response = joinTeste.getInfo();

        return `Datamap available ${response}`;
    }

    public async orderOperation(name: string, description: string, operation: any) {
        return `Order operation '${name}' configured to sort by '${operation.field}' in '${operation.classification}' order.`;
    }

    public async groupByOperation(name: string, description: string, operation: any) {
        return `GroupBy operation '${name}' configured to aggregate by '${operation.aggregation}' on field '${operation.field}'.`;
    }

    public async filterOperation(name: string, description: string, operation: any) {
        return `Filter operation '${name}' with description '${description}' configured.`;
    }

    public async splitOperation(name: string, description: string, operation: any) {
        return `Split operation '${name}' with description '${description}' configured.`;
    }

    public async addRowsOperation(name: string, description: string, operation: string) {
        return `Add Rows operation '${name}' with operation details '${operation}' configured.`;
    }

    public async removeRowsOperation(name: string, description: string, operation: any) {
        return `Remove Rows operation '${name}' configured to remove rows where '${operation.field} ${operation.conditionOperator} ${operation.value}'.`;
    }

    public async removeDuplicatesOperation(name: string, description: string) {
        return `Remove Duplicates operation '${name}' with description '${description}' configured.`;
    }

    public async selectColumnsOperation(name: string, description: string, operation: any) {
        return `Select Columns operation '${name}' configured for field '${operation.field}' with alias '${operation.alias}'.`;
    }

    public async changeDataOperation(name: string, description: string, operation: any) {
        return `Change Data operation '${name}' with description '${description}' configured.`;
    }

    public async sqlOperation(name: string, description: string, operation: string) {
        return `SQL operation '${name}' with SQL query configured.`;
    }

    public async exportOperation(name: string, description: string, type: string) {
        return `Export operation '${name}' with description '${description}' configured to export to '${type}'.`;
    }

    public async outputTableOperation(name: string, description: string, tableName: string, operation: any) {
        return `Output Table operation '${name}' configured to create table '${tableName}'.`;
    }

    public async remove() {
        return `Item successfully removed.`;
    }

    public async execute() {
        return `Execution started successfully.`;
    }

    public async save() {
        return `DataFlow saved successfully.`;
    }
}