/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ISubscriptionContext, nonNullProp } from '@microsoft/vscode-azext-utils';
import { randomUUID } from 'crypto';
import { Event, EventEmitter } from 'vscode';
import { AzureAccountExtensionApi, AzureLoginStatus, AzureResourceFilter, AzureSession, AzureSubscription, CloudShell } from '../../azure-account.api';

export class MockAzureAccount implements AzureAccountExtensionApi {
    public status: AzureLoginStatus = 'LoggedOut';
    public onStatusChanged: Event<AzureLoginStatus>;
    public sessions: AzureSession[] = [];
    public onSessionsChanged: Event<void>;
    public subscriptions: AzureSubscription[] = [];
    public onSubscriptionsChanged: Event<void>;
    public filters: AzureResourceFilter[] = [];
    public onFiltersChanged: Event<void>;

    apiVersion = '1.0.0';

    createCloudShell(_os: 'Linux' | 'Windows'): CloudShell {
        throw new Error('not implemented');
    }

    private readonly _onStatusChangedEmitter: EventEmitter<AzureLoginStatus>;
    private readonly _onFiltersChangedEmitter: EventEmitter<void>;
    private readonly _onSessionsChangedEmitter: EventEmitter<void>;
    private readonly _onSubscriptionsChangedEmitter: EventEmitter<void>;

    public constructor(vscode: typeof import('vscode')) {
        this._onStatusChangedEmitter = new vscode.EventEmitter<AzureLoginStatus>();
        this.onStatusChanged = this._onStatusChangedEmitter.event;
        this._onFiltersChangedEmitter = new vscode.EventEmitter<void>();
        this.onFiltersChanged = this._onFiltersChangedEmitter.event;
        this._onSessionsChangedEmitter = new vscode.EventEmitter<void>();
        this.onSessionsChanged = this._onSessionsChangedEmitter.event;
        this._onSubscriptionsChangedEmitter = new vscode.EventEmitter<void>();
        this.onSubscriptionsChanged = this._onSubscriptionsChangedEmitter.event;
    }

    public async signIn(): Promise<void> {
        this.changeStatus('LoggingIn');

        const session: AzureSession = {
            environment: 'environment',
            userId: '',
            tenantId: 'tenantId',
            credentials2: {
                getToken: () => {
                    return undefined;
                }
            },
        } as unknown as AzureSession;

        const subscriptionId = randomUUID();
        const mockAzureSubscription: AzureSubscription = {
            session: session,
            subscription: {
                displayName: 'mockSubscription',
                subscriptionId,
                id: `/subscriptions/${subscriptionId}`
            }
        };

        this.subscriptions.push(mockAzureSubscription);
        this.changeStatus('LoggedIn');
        this.changeFilter(mockAzureSubscription);
    }

    public signOut(): void {
        this.changeStatus('LoggedOut');
        this.changeFilter();
        this.subscriptions = [];
    }

    public getSubscriptionContext(): ISubscriptionContext {
        this.verifySubscription();
        const info: AzureSubscription = this.subscriptions[0];
        return {
            credentials: info.session.credentials2,
            subscriptionDisplayName: nonNullProp(info.subscription, 'displayName'),
            subscriptionId: nonNullProp(info.subscription, 'subscriptionId'),
            subscriptionPath: nonNullProp(info.subscription, 'id'),
            tenantId: info.session.tenantId,
            userId: info.session.userId,
            environment: info.session.environment,
            isCustomCloud: false
        };
    }

    public async waitForLogin(): Promise<boolean> {
        return true;
    }

    public async waitForSubscriptions(): Promise<boolean> {
        return true;
    }

    public async waitForFilters(): Promise<boolean> {
        return true;
    }

    private changeStatus(newStatus: AzureLoginStatus): void {
        this.status = newStatus;
        this._onStatusChangedEmitter.fire(this.status);
    }

    private changeFilter(newFilter?: AzureResourceFilter): void {
        if (newFilter) {
            this.filters.push(newFilter);
        } else {
            this.filters = [];
        }

        this._onFiltersChangedEmitter.fire();
    }

    private verifySubscription(): void {
        if (this.subscriptions.length === 0) {
            const noSubscription: string = 'No subscription found.  Invoke TestAzureAccount.signIn().';
            throw new Error(noSubscription);
        }
    }
}