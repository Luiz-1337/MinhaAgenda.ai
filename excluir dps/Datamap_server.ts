import {McpServer} from "@modelcontextprotocol/sdk/server/mcp.js";
import {StdioServerTransport} from "@modelcontextprotocol/sdk/server/stdio.js";
import {z} from "zod"
import {DatamapTools} from "./Datamap_tools.js"


const datamapTools = new DatamapTools();

const server = new McpServer({
    name: "model-manager",
    version: "1.0.0",
    capabilities: {
        tools: {}
    },
});

server.tool(
    "add-dataflow",
    "Add a new dataflow, to create a new datamap we need to add a dataflow",
    {
        name: z.string().describe("Name of the dataflow"),
    },
    async ({ name }) => {
        const resultMessage = await datamapTools.addDataFlow(name);
        return {
            content: [{ type: "text", text: resultMessage }]
        };
    }
);

server.tool(
    "add-dataload",
    "Add a new dataload",
    {
        name: z.string().describe("Name of the dataload"),
        description: z.string().default("dataload").describe("Description of the dataload"),
        loadOperation: z.string().describe("Data load details or source, e.g. ('Excel', 'Flow', 'DataMap', 'External Connector', 'ODBC', 'OLEDB', 'SQLite', 'SQLServer')"),
    },
    async ({ name, description, loadOperation }) => {
        const resultMessage = await datamapTools.addDataLoad(name, description, loadOperation);
        return {
            content: [{ type: "text", text: resultMessage }]
        };
    }
);

server.tool(
    "union-operation",
    "Configure a union operation",
    {
        name: z.string().describe("Name of the union operation"),
        description: z.string().optional().describe("Optional description for the operation"),
    },
    async ({ name, description }) => {
        const resultMessage = await datamapTools.unionOperation(name, description);
        return {
            content: [{ type: "text", text: resultMessage }]
        };
    }
);

server.tool(
    "add-join-operation",
    "Add a join element",
    {
        name: z.string().describe("Name of the merge operation"),
        description: z.string().describe("Description for the operation"),
        operation: z.array(
            z.object({
                joinType: z.string().describe("O tipo de associação entre as tabelas (ex: 'inner', 'left', 'right')"),
                firstTable: z.string().describe("A primeira tabela a ser unida (esquerda)"),
                firstColumn: z.string().describe("A coluna da primeira tabela para a junção"),
                secondTable: z.string().describe("A segunda tabela a ser unida (direita)"),
                secondColumn: z.string().describe("A coluna da segunda tabela para a junção"),
            }).describe("Configuração de uma única etapa de junção")
        ).describe("Uma lista de configurações de junção a serem executadas sequencialmente ou em lote"),
    },
    async ({ name, description, operation }) => {
        const resultMessage = await datamapTools.addjoinOperation(name, description, operation);
        return {
            content: [{ type: "text", text: resultMessage }]
        };
    }
);

server.tool(
    "remove-join-operation",
    "Remove a join element",
    {
        index: z.number().describe("\n" +
            "Index number to be deleted. If the index is not passed, do not provide it.").optional(),
    },
    async ({ index }) => {
        const resultMessage = await datamapTools.deletejoinOperation(index);
        return {
            content: [{ type: "text", text: resultMessage }]
        };
    }
);

server.tool(
    "get-information",
    "Get informations from datamap, like operations available",{},
    async () => {
        const resultMessage = await datamapTools.getInfo();
        return {
            content: [{ type: "text", text: resultMessage }]
        };
    }
);

server.tool(
    "order-operation",
    "Configure an order/sort operation",
    {
        name: z.string().describe("Name of the order operation"),
        description: z.string().describe("Description for the operation"),
        operation: z.object({
            field: z.string().describe("The field to sort by"),
            classification: z.enum(["asc", "desc, none"]).describe("The sort order"),
        }).describe("Configuration for the ordering"),
    },
    async ({ name, description, operation }) => {
        const resultMessage = await datamapTools.orderOperation(name, description, operation);
        return {
            content: [{ type: "text", text: resultMessage }]
        };
    }
);

server.tool(
    "group-by-operation",
    "Configure a group by operation",
    {
        name: z.string().describe("Name of the group by operation"),
        description: z.string().describe("Description for the operation"),
        operation: z.object({
            aggregation: z.string().describe("The aggregation function (e.g., MAX, MIN, SUM, AVG, COUNT, HAVING, NONE)"),
            field: z.string().describe("The field to aggregate on"),
        }).describe("Configuration for the aggregation"),
    },
    async ({ name, description, operation }) => {
        const resultMessage = await datamapTools.groupByOperation(name, description, operation);
        return {
            content: [{ type: "text", text: resultMessage }]
        };
    }
);

server.tool(
    "filter-operation",
    "Configure a filter operation",
    {
        name: z.string().describe("Name of the filter operation"),
        description: z.string().describe("Description for the operation"),
        operation: z.object({
            field: z.string().describe("The field to aggregate on"),
            conditionOperator: z.string().describe("The comparison operator (e.g., NOT EQUAL, EQUAL, GREATER THAN, LESS THAN, GREATER THAN OR EQUAL TO, LESS THAN OR EQUAL TO, IN)"),
            value: z.string().describe("The value to compare against"),
            condition: z.string().describe("The condition to filter by (e.g., AND, OR, NONE)"),
        }),
    },
    async ({ name, description, operation }) => {
        const resultMessage = await datamapTools.filterOperation(name, description, operation);
        return {
            content: [{ type: "text", text: resultMessage }]
        };
    }
);

server.tool(
    "split-operation",
    "Configure a split operation",
    {
        name: z.string().describe("Name of the split operation"),
        description: z.string().describe("Description for the operation"),
        operation: z.object({
            field: z.string().describe("The field to aggregate on"),
            conditionOperator: z.string().describe("The comparison operator (e.g., NOT EQUAL, EQUAL, GREATER THAN, LESS THAN, GREATER THAN OR EQUAL TO, LESS THAN OR EQUAL TO, IN)"),
            value: z.string().describe("The value to compare against"),
            condition: z.string().describe("The condition to filter by (e.g., AND, OR, NONE)"), 
        })
    },
    async ({ name, description, operation }) => {
        const resultMessage = await datamapTools.splitOperation(name, description, operation);
        return {
            content: [{ type: "text", text: resultMessage }]
        };
    }
);

server.tool(
    "add-rows-operation",
    "Configure an add rows operation",
    {
        name: z.string().describe("Name of the add rows operation"),
        description: z.string().describe("Description for the operation"),
        operation: z.string().describe("Details of the rows to add"),
    },
    async ({ name, description, operation }) => {
        const resultMessage = await datamapTools.addRowsOperation(name, description, operation);
        return {
            content: [{ type: "text", text: resultMessage }]
        };
    }
);

server.tool(
    "remove-rows-operation",
    "Configure a remove rows operation",
    {
        name: z.string().describe("Name of the remove rows operation"),
        description: z.string().describe("Description for the operation"),
        operation: z.object({
            field: z.string().describe("The field to aggregate on"),
            conditionOperator: z.string().describe("The comparison operator (e.g., NOT EQUAL, EQUAL, GREATER THAN, LESS THAN, GREATER THAN OR EQUAL TO, LESS THAN OR EQUAL TO, IN)"),
            value: z.string().describe("The value to compare against"),
            condition: z.string().describe("The condition to filter by (e.g., AND, OR, NONE)"),
        }).describe("Configuration for the row removal condition"),
    },
    async ({ name, description, operation }) => {
        const resultMessage = await datamapTools.removeRowsOperation(name, description, operation);
        return {
            content: [{ type: "text", text: resultMessage }]
        };
    }
);

server.tool(
    "remove-duplicates-operation",
    "Configure a remove duplicates operation",
    {
        name: z.string().describe("Name of the remove duplicates operation"),
        description: z.string().describe("Description for the operation"),
    },
    async ({ name, description }) => {
        const resultMessage = await datamapTools.removeDuplicatesOperation(name, description);
        return {
            content: [{ type: "text", text: resultMessage }]
        };
    }
);

server.tool(
    "select-columns-operation",
    "Configure a select columns operation",
    {
        name: z.string().describe("Name of the select columns operation"),
        description: z.string().describe("Description for the operation"),
        operation: z.object({
            field: z.string().describe("The field to select"),
            alias: z.string().describe("A new name (alias) for the selected field"),
        }).describe("Configuration for column selection"),
    },
    async ({ name, description, operation }) => {
        const resultMessage = await datamapTools.selectColumnsOperation(name, description, operation);
        return {
            content: [{ type: "text", text: resultMessage }]
        };
    }
);

server.tool(
    "change-data-operation",
    "Configure a change data operation",
    {
        name: z.string().describe("Name of the change data operation"),
        description: z.string().describe("Description for the operation"),
        operation: z.object({
            updateField: z.string().describe("The field to update on"),
            updateOperator: z.string().describe("The update operator, always EQUAL)"),
            updateValue: z.string().describe("The value to update the field with"),
            conditionField: z.string().describe("The field to compare against"),
            conditionOperator: z.string().describe("The comparison operator (e.g., NOT EQUAL, EQUAL, GREATER THAN, LESS THAN, GREATER THAN OR EQUAL TO, LESS THAN OR EQUAL TO, IN)"),
            conditionValue: z.string().describe("The value to compare against"),
            condition: z.string().describe("The condition to filter by (e.g., AND, OR, NONE)"),
        }),
    },
    async ({ name, description, operation }) => {
        const resultMessage = await datamapTools.changeDataOperation(name, description, operation);
        return {
            content: [{ type: "text", text: resultMessage }]
        };
    }
);

server.tool(
    "sql-operation",
    "Configure a custom SQL operation",
    {
        name: z.string().describe("Name of the SQL operation"),
        description: z.string().describe("Description for the operation"),
        operation: z.string().describe("The SQL query to execute"),
    },
    async ({ name, description, operation }) => {
        const resultMessage = await datamapTools.sqlOperation(name, description, operation);
        return {
            content: [{ type: "text", text: resultMessage }]
        };
    }
);


server.tool(
    "export-operation",
    "Configure an export operation",
    {
        name: z.string().describe("Name of the export operation"),
        description: z.string().describe("Description for the operation"),
        type: z.string().describe("The export format (e.g., Excel, ODBC, OLEDB, SQLite, SQLServer)"),
    },
    async ({ name, description, type }) => {
        const resultMessage = await datamapTools.exportOperation(name, description, type);
        return {
            content: [{ type: "text", text: resultMessage }]
        };
    }
);

server.tool(
    "output-table-operation",
    "Configure an output table operation",
    {
        name: z.string().describe("Name of the output table operation"),
        description: z.string().describe("Description for the operation"),
        tableName: z.string().describe("The name of the destination table"),
        operation: z.object({
            field: z.string().describe("The field to aggregate on"),
            type: z.string().describe("The type of export (e.g., TEXT, REAL, INTEGER, DATETIME,)"),
            index: z.boolean().describe("Whether to include an index column"),
        }),
    },
    async ({ name, description, tableName, operation }) => {
        const resultMessage = await datamapTools.outputTableOperation(name, description, tableName, operation);
        return {
            content: [{ type: "text", text: resultMessage }]
        };
    }
);

server.tool(
    "remove",
    "Remove an item (e.g., an operation or a dataload) from the dataflow",
    {},
    async () => {
        const resultMessage = await datamapTools.remove();
        return {
            content: [{ type: "text", text: resultMessage }]
        };
    }
);

server.tool(
    "execute",
    "Execute the entire dataflow",
    {},
    async () => {
        const resultMessage = await datamapTools.execute();
        return {
            content: [{ type: "text", text: resultMessage }]
        };
    }
);

server.tool(
    "save",
    "Save the current state of the dataflow",
    {},
    async () => {
        const resultMessage = await datamapTools.save();
        return {
            content: [{ type: "text", text: resultMessage }]
        };
    }
);


async function main() {
    try {
        const transport = new StdioServerTransport();
        await server.connect(transport);
        console.log("Connected and all tools are registered.");
    } catch (e) {
        console.error("Failed to start server:", e);
        process.exit(1);
    }
}

main().catch(console.error);