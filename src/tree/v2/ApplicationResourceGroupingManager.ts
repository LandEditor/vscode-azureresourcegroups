import * as vscode from 'vscode';
import { ApplicationResource } from '../../api/v2/v2AzureResourcesApi';
import { GroupBySettings } from '../../commands/explorer/groupBy';
import { ext } from '../../extensionVariables';
import { settingUtils } from '../../utils/settingUtils';
import { ApplicationResourceItem } from './ApplicationResourceItem';
import { GenericItem } from './GenericItem';
import { localize } from "../../utils/localize";
import { treeUtils } from '../../utils/treeUtils';
import { TreeItemIconPath } from '@microsoft/vscode-azext-utils';

const unknownLabel = localize('unknown', 'unknown');

export class ApplicationResourceGroupingManager extends vscode.Disposable {
    private readonly onDidChangeGroupingEmitter = new vscode.EventEmitter<void>();
    private readonly configSubscription: vscode.Disposable;

    constructor() {
        super(
            () =>
            {
                this.configSubscription.dispose();
            });

            this.configSubscription = vscode.workspace.onDidChangeConfiguration(
                e => {
                    if (e.affectsConfiguration(`${ext.prefix}.groupBy`)) {
                        this.onDidChangeGroupingEmitter.fire();
                    }
                });
    }

    get onDidChangeGrouping(): vscode.Event<void> {
        return this.onDidChangeGroupingEmitter.event;
    }

    groupResources(resources: ApplicationResource[]): GenericItem[] {
        const groupBy = settingUtils.getWorkspaceSetting<string>('groupBy');

        if (groupBy?.startsWith('armTag')) {
            const tag = groupBy.substring('armTag'.length + 1);

            return this.groupByArmTag(resources, tag);
        }

        switch (groupBy) {
            case GroupBySettings.Location:

                return this.groupByLocation(resources);

            case GroupBySettings.ResourceType:

                return this.groupByResourceType(resources);

            case GroupBySettings.ResourceGroup:
            default:

                return this.groupByResourceGroup(resources);
        }
    }

    // TODO: Consolidate repeated grouping logic.
    private groupBy(resources: ApplicationResource[], keySelector: (resource: ApplicationResource) => string, labelSelector: (key: string) => string, iconSelector: (key: string) => TreeItemIconPath | undefined): GenericItem[] {
        const map = resources.reduce(
            (acc, resource) => {
                const key = keySelector(resource);
                let children = acc[key];

                if (!children) {
                    acc[key] = children = [];
                }

                children.push(new ApplicationResourceItem(resource));

                return acc;
            },
            <{ [key: string]: ApplicationResourceItem[] }>{});

        return Object.keys(map).sort((a, b) => a.localeCompare(b)).map(key => {
            return new GenericItem(
                labelSelector(key),
                {
                    children: map[key],
                    iconPath: iconSelector(key)
                });
        });
    }

    private groupByArmTag(resources: ApplicationResource[], tag: string): GenericItem[] {
        const ungroupedKey = 'ungrouped';
        return this.groupBy(
            resources,
            resource => resource.tags?.[tag] ?? ungroupedKey,
            key => key !== ungroupedKey ? key : localize('ungrouped', 'ungrouped'),
            key => new vscode.ThemeIcon(key !== ungroupedKey ? 'tag' : 'json'));
    }

    private groupByLocation(resources: ApplicationResource[]): GenericItem[] {
        return this.groupBy(
            resources,
            resource => resource.location ?? unknownLabel, // TODO: Is location ever undefined?
            key => key,
            () => new vscode.ThemeIcon('globe'));
    }

    private groupByResourceGroup(resources: ApplicationResource[]): GenericItem[] {
        return this.groupBy(
            resources,
            resource => resource.resourceGroup?.toLowerCase() ?? unknownLabel, // TODO: Is resource group ever undefined? Should resource group be normalized on creation?
            key => key,
            () => treeUtils.getIconPath('resourceGroup'));
    }

    private groupByResourceType(resources: ApplicationResource[]): GenericItem[] {
        return this.groupBy(
            resources,
            resource => resource.type ?? unknownLabel, // TODO: Is resource type ever undefined?
            key => key,
            () => undefined); // TODO: What's the default icon for a resource type?
    }
}