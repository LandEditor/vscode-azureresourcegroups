/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtTreeItem } from '@microsoft/vscode-azext-utils';
import * as vscode from 'vscode';
import { WorkspaceResourceProviderManager } from '../../../api/v2/ResourceProviderManagers';
import { ext } from '../../../extensionVariables';
import { BranchDataItemCache } from '../BranchDataItemCache';
import { createTreeView } from '../createTreeView';
import { ResourceGroupsItem } from '../ResourceGroupsItem';
import { localize } from './../../../utils/localize';
import { WorkspaceResourceBranchDataProviderManager } from './WorkspaceResourceBranchDataProviderManager';
import { WorkspaceResourceTreeDataProvider } from './WorkspaceResourceTreeDataProvider';

interface RegisterWorkspaceTreeOptions {
    workspaceResourceBranchDataProviderManager: WorkspaceResourceBranchDataProviderManager,
    workspaceResourceProviderManager: WorkspaceResourceProviderManager,
    refreshEvent: vscode.Event<void | ResourceGroupsItem | ResourceGroupsItem[] | null | undefined>,
}

export function registerWorkspaceTree(context: vscode.ExtensionContext, options: RegisterWorkspaceTreeOptions): WorkspaceResourceTreeDataProvider {
    const { workspaceResourceBranchDataProviderManager, workspaceResourceProviderManager, refreshEvent } = options;

    const itemCache = new BranchDataItemCache();
    const workspaceResourceTreeDataProvider =
        new WorkspaceResourceTreeDataProvider(workspaceResourceBranchDataProviderManager, refreshEvent, workspaceResourceProviderManager, itemCache);
    context.subscriptions.push(workspaceResourceTreeDataProvider);

    const treeView = createTreeView('azureWorkspace', {
        canSelectMany: true,
        showCollapseAll: true,
        treeDataProvider: workspaceResourceTreeDataProvider,
        description: localize('local', 'Local'),
        itemCache,
    });
    context.subscriptions.push(treeView);

    treeView.description = localize('local', 'Local');

    ext.workspaceTreeView = treeView as unknown as vscode.TreeView<AzExtTreeItem>;

    return workspaceResourceTreeDataProvider;
}