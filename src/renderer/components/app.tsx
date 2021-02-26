import React from "react";
import { computed, observable, reaction } from "mobx";
import { disposeOnUnmount, observer } from "mobx-react";
import { Redirect, Route, Router, Switch } from "react-router";
import { history } from "../navigation";
import { Notifications } from "./notifications";
import { NotFound } from "./+404";
import { UserManagement } from "./+user-management/user-management";
import { ConfirmDialog } from "./confirm-dialog";
import { usersManagementRoute } from "./+user-management/user-management.route";
import { clusterRoute, clusterURL } from "./+cluster";
import { KubeConfigDialog } from "./kubeconfig-dialog/kubeconfig-dialog";
import { Nodes, nodesRoute } from "./+nodes";
import { Workloads, workloadsRoute, workloadsURL } from "./+workloads";
import { Namespaces, namespacesRoute } from "./+namespaces";
import { Network, networkRoute } from "./+network";
import { Storage, storageRoute } from "./+storage";
import { ClusterOverview } from "./+cluster/cluster-overview";
import { Config, configRoute } from "./+config";
import { Events } from "./+events/events";
import { eventRoute } from "./+events";
import { Apps, appsRoute } from "./+apps";
import { KubeObjectDetails } from "./kube-object/kube-object-details";
import { AddRoleBindingDialog } from "./+user-management-roles-bindings";
import { DeploymentScaleDialog } from "./+workloads-deployments/deployment-scale-dialog";
import { CronJobTriggerDialog } from "./+workloads-cronjobs/cronjob-trigger-dialog";
import { CustomResources } from "./+custom-resources/custom-resources";
import { crdRoute } from "./+custom-resources";
import { isAllowedResource } from "../../common/rbac";
import { MainLayout } from "./layout/main-layout";
import { ErrorBoundary } from "./error-boundary";
import { Terminal } from "./dock/terminal";
import { getHostedCluster, getHostedClusterId } from "../../common/cluster-store";
import logger from "../../main/logger";
import { webFrame } from "electron";
import { extensionLoader } from "../../extensions/extension-loader";
import { appEventBus } from "../../common/event-bus";
import { broadcastMessage, requestMain } from "../../common/ipc";
import whatInput from "what-input";
import { clusterSetFrameIdHandler } from "../../common/cluster-ipc";
import { getAllRegisteredPages, getByPageTarget, getClusterPageMenuByPage, getRootClusterPageMenus, getTabLayoutRoutes, RegisteredClusterPageMenu, RegistrationScope } from "../../extensions/registries";
import { TabLayout} from "./layout/tab-layout";
import { StatefulSetScaleDialog } from "./+workloads-statefulsets/statefulset-scale-dialog";
import { eventStore } from "./+events/event.store";
import { nodesStore } from "./+nodes/nodes.store";
import { podsStore } from "./+workloads-pods/pods.store";
import { kubeWatchApi } from "../api/kube-watch-api";
import { ReplicaSetScaleDialog } from "./+workloads-replicasets/replicaset-scale-dialog";
import { CommandContainer } from "./command-palette/command-container";
import { KubeObjectStore } from "../kube-object.store";
import { clusterContext } from "./context";

@observer
export class App extends React.Component {
  static async init() {
    const frameId = webFrame.routingId;
    const clusterId = getHostedClusterId();

    logger.info(`[APP]: Init dashboard, clusterId=${clusterId}, frameId=${frameId}`);
    await Terminal.preloadFonts();

    await requestMain(clusterSetFrameIdHandler, clusterId);
    await getHostedCluster().whenReady; // cluster.activate() is done at this point
    extensionLoader.loadOnClusterRenderer();
    setTimeout(() => {
      appEventBus.emit({
        name: "cluster",
        action: "open",
        params: {
          clusterId
        }
      });
    });
    window.addEventListener("online", () => {
      window.location.reload();
    });
    whatInput.ask(); // Start to monitor user input device

    // Setup hosted cluster context
    KubeObjectStore.defaultContext = clusterContext;
    kubeWatchApi.context = clusterContext;
  }

  componentDidMount() {
    disposeOnUnmount(this, [
      kubeWatchApi.subscribeStores([podsStore, nodesStore, eventStore], {
        preload: true,
      }),

      reaction(() => this.warningsTotal, (count: number) => {
        broadcastMessage(`cluster-warning-event-count:${getHostedCluster().id}`, count);
      }),

      reaction(() => getRootClusterPageMenus(), (rootItems) => {
        this.generateExtensionTabLayoutRoutes(rootItems);
      }, {
        fireImmediately: true
      })
    ]);
  }

  @computed get warningsTotal(): number {
    return nodesStore.getWarningsCount() + eventStore.getWarningsCount();
  }

  get startURL() {
    if (isAllowedResource(["events", "nodes", "pods"])) {
      return clusterURL();
    }

    return workloadsURL();
  }

  renderExtensionTabLayoutRoutes() {
    return getRootClusterPageMenus().map((menu, index) => {
      const tabRoutes = getTabLayoutRoutes(menu);

      if (tabRoutes.length > 0) {
        const pageComponent = () => <TabLayout tabs={tabRoutes}/>;

        return <Route key={`extension-tab-layout-route-${index}`} component={pageComponent} path={tabRoutes.map((tab) => tab.routePath)}/>;
      } else {
        const page = getByPageTarget(menu.target, new Set([RegistrationScope.CLUSTER]));

        if (page) {
          return <Route key={`extension-tab-layout-route-${index}`} path={page.url} component={page.components.Page}/>;
        }
      }
    });
  }

  @observable extensionRoutes: Map<RegisteredClusterPageMenu, React.ReactNode> = new Map();

  generateExtensionTabLayoutRoutes(rootItems: RegisteredClusterPageMenu[]) {
    rootItems.forEach((menu, index) => {
      let route = this.extensionRoutes.get(menu);

      if (!route) {
        const tabRoutes = getTabLayoutRoutes(menu);

        if (tabRoutes.length > 0) {
          const pageComponent = () => <TabLayout tabs={tabRoutes}/>;

          route = <Route key={`extension-tab-layout-route-${index}`} component={pageComponent} path={tabRoutes.map((tab) => tab.routePath)}/>;
          this.extensionRoutes.set(menu, route);
        } else {
          const page = getByPageTarget(menu.target, new Set([RegistrationScope.CLUSTER]));

          if (page) {
            route = <Route key={`extension-tab-layout-route-${index}`} path={page.url} component={page.components.Page}/>;
            this.extensionRoutes.set(menu, route);
          }
        }
      }
    });

    for (const menu of this.extensionRoutes.keys()) {
      if (!rootItems.includes(menu)) {
        this.extensionRoutes.delete(menu);
      }
    }
  }

  renderExtensionRoutes() {
    return getAllRegisteredPages(RegistrationScope.CLUSTER).map((page, index) => {
      const menu = getClusterPageMenuByPage(page);

      if (!menu) {
        return <Route key={`extension-route-${index}`} path={page.url} component={page.components.Page}/>;
      }
    });
  }

  render() {
    const cluster = getHostedCluster();

    return (
      <Router history={history}>
        <ErrorBoundary>
          <MainLayout>
            <Switch>
              <Route component={ClusterOverview} {...clusterRoute}/>
              <Route component={Nodes} {...nodesRoute}/>
              <Route component={Workloads} {...workloadsRoute}/>
              <Route component={Config} {...configRoute}/>
              <Route component={Network} {...networkRoute}/>
              <Route component={Storage} {...storageRoute}/>
              <Route component={Namespaces} {...namespacesRoute}/>
              <Route component={Events} {...eventRoute}/>
              <Route component={CustomResources} {...crdRoute}/>
              <Route component={UserManagement} {...usersManagementRoute}/>
              <Route component={Apps} {...appsRoute}/>
              {this.renderExtensionTabLayoutRoutes()}
              {this.renderExtensionRoutes()}
              <Redirect exact from="/" to={this.startURL}/>
              <Route component={NotFound}/>
            </Switch>
          </MainLayout>
          <Notifications/>
          <ConfirmDialog/>
          <KubeObjectDetails/>
          <KubeConfigDialog/>
          <AddRoleBindingDialog/>
          <DeploymentScaleDialog/>
          <StatefulSetScaleDialog/>
          <ReplicaSetScaleDialog/>
          <CronJobTriggerDialog/>
          <CommandContainer cluster={cluster}/>
        </ErrorBoundary>
      </Router>
    );
  }
}
