import { useState } from "react";
import { useLoaderData, useFetcher } from "react-router";
import { authenticate } from "../shopify.server";
import { Card, Page, Layout, IndexTable, Text, Badge, Button, Modal, Form, FormLayout, TextField, Select } from "@shopify/polaris";
import prisma from "../db.server";

export const loader = async ({ request }) => {
    await authenticate.admin(request);
    const discounts = await prisma.discountCode.findMany({
        orderBy: { code: 'asc' }
    });
    return Response.json({ discounts });
};

export const action = async ({ request }) => {
    await authenticate.admin(request);
    const formData = await request.formData();

    const actionType = formData.get("actionType");

    if (actionType === "create") {
        const code = formData.get("code");
        const type = formData.get("type");
        const value = parseFloat(formData.get("value"));
        const applicableTo = formData.get("applicableTo");
        const usageLimit = parseInt(formData.get("usageLimit"), 10) || null;

        if (!code || isNaN(value)) return Response.json({ error: "Invalid data" }, { status: 400 });

        try {
            await prisma.discountCode.create({
                data: {
                    code,
                    type,
                    value,
                    applicableTo,
                    usageLimit
                }
            });
            return Response.json({ success: true });
        } catch (e) {
            return Response.json({ error: "Failed to create code. It might already exist." }, { status: 400 });
        }
    }

    if (actionType === "delete") {
        await prisma.discountCode.delete({ where: { id: formData.get("id") } });
        return Response.json({ success: true });
    }

    return Response.json({ error: "Invalid action" }, { status: 400 });
};

export default function DiscountsPage() {
    const { discounts } = useLoaderData();
    const fetcher = useFetcher();
    const [modalOpen, setModalOpen] = useState(false);

    const [code, setCode] = useState("");
    const [type, setType] = useState("PERCENTAGE");
    const [value, setValue] = useState("");
    const [applicableTo, setApplicableTo] = useState("ALL");
    const [usageLimit, setUsageLimit] = useState("");

    const handleCreate = () => {
        fetcher.submit(
            { actionType: "create", code, type, value, applicableTo, usageLimit },
            { method: "post" }
        );
        setModalOpen(false);
    };

    const handleDelete = (id) => {
        fetcher.submit({ actionType: "delete", id }, { method: "post" });
    };

    const rowMarkup = discounts.map(({ id, code, type, value, applicableTo, usageLimit, timesUsed }, index) => (
        <IndexTable.Row id={id} key={id} position={index}>
            <IndexTable.Cell><Text fontWeight="bold" as="span">{code}</Text></IndexTable.Cell>
            <IndexTable.Cell>{type === "PERCENTAGE" ? `${value}%` : `$${value}`}</IndexTable.Cell>
            <IndexTable.Cell><Badge status="info">{applicableTo}</Badge></IndexTable.Cell>
            <IndexTable.Cell>{timesUsed} / {usageLimit || "∞"}</IndexTable.Cell>
            <IndexTable.Cell>
                <Button onClick={() => handleDelete(id)} destructive outline size="micro">Delete</Button>
            </IndexTable.Cell>
        </IndexTable.Row>
    ));

    return (
        <Page
            title="Discount Codes (Internal Admin)"
            primaryAction={{ content: 'Create Code', onAction: () => setModalOpen(true) }}
        >
            <Layout>
                <Layout.Section>
                    <Card padding="0">
                        <IndexTable
                            resourceName={{ singular: 'discount', plural: 'discounts' }}
                            itemCount={discounts.length}
                            headings={[
                                { title: 'Code' },
                                { title: 'Value' },
                                { title: 'Applies To' },
                                { title: 'Usage' },
                                { title: 'Actions' },
                            ]}
                            selectable={false}
                        >
                            {rowMarkup}
                        </IndexTable>
                    </Card>
                </Layout.Section>
            </Layout>

            <Modal
                open={modalOpen}
                onClose={() => setModalOpen(false)}
                title="Create Discount Code"
                primaryAction={{ content: 'Save', onAction: handleCreate }}
                secondaryActions={[{ content: 'Cancel', onAction: () => setModalOpen(false) }]}
            >
                <Modal.Section>
                    <FormLayout>
                        <TextField label="Discount Code (e.g. BFCM20)" value={code} onChange={setCode} autoComplete="off" />
                        <Select
                            label="Type"
                            options={[{ label: 'Percentage (%)', value: 'PERCENTAGE' }, { label: 'Fixed Amount ($)', value: 'FIXED' }]}
                            value={type}
                            onChange={setType}
                        />
                        <TextField label="Discount Value" type="number" value={value} onChange={setValue} autoComplete="off" />
                        <Select
                            label="Applicable To"
                            options={[{ label: 'Everything', value: 'ALL' }, { label: 'Individual Blocks Only', value: 'BLOCK' }, { label: 'Bundles Only', value: 'BUNDLE' }]}
                            value={applicableTo}
                            onChange={setApplicableTo}
                        />
                        <TextField label="Usage Limit (Empty for infinite)" type="number" value={usageLimit} onChange={setUsageLimit} autoComplete="off" />
                    </FormLayout>
                </Modal.Section>
            </Modal>
        </Page>
    );
}
