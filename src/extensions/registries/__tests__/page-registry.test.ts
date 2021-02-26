import { getExtensionPageUrl, PageParams } from "../page-registry";
import React from "react";
import { LensRendererExtension } from "../../core-api";
import { findRegisteredPage, PageRegistration } from "..";

let ext: LensRendererExtension = null;

describe("getPageUrl", () => {
  beforeEach(async () => {
    ext = new LensRendererExtension({
      manifest: {
        name: "foo-bar",
        version: "0.1.1"
      },
      id: "/this/is/fake/package.json",
      absolutePath: "/absolute/fake/",
      manifestPath: "/this/is/fake/package.json",
      isBundled: false,
      isEnabled: true
    });
    (ext.globalPages as PageRegistration[]).push({
      id: "page-with-params",
      components: {
        Page: () => React.createElement("Page with params")
      },
      params: {
        test1: "test1-default",
        test2: "" // no default value, just declaration
      },
    });
  });

  it("returns a page url for extension", () => {
    expect(getExtensionPageUrl({ extensionName: ext.name })).toBe("/extension/foo-bar");
  });

  it("allows to pass base url as parameter", () => {
    expect(getExtensionPageUrl({ extensionName: ext.name, pageId: "/test" })).toBe("/extension/foo-bar/test");
  });

  it("removes @ and replace `/` to `--`", () => {
    expect(getExtensionPageUrl({ extensionName: "@foo/bar" })).toBe("/extension/foo--bar");
  });

  it("adds / prefix", () => {
    expect(getExtensionPageUrl({ extensionName: ext.name, pageId: "test" })).toBe("/extension/foo-bar/test");
  });

  it("normalize possible multi-slashes in page.id", () => {
    expect(getExtensionPageUrl({ extensionName: ext.name, pageId: "//test/" })).toBe("/extension/foo-bar/test");
  });

  it("gets page url with custom params", () => {
    const params: PageParams<string> = { test1: "one", test2: "2" };
    const searchParams = new URLSearchParams(params);
    const pageUrl = getExtensionPageUrl({ extensionName: ext.name, pageId: "page-with-params", params });

    expect(pageUrl).toBe(`/extension/foo-bar/page-with-params?${searchParams}`);
  });

  it("gets page url with default custom params", () => {
    const defaultPageUrl = getExtensionPageUrl({ extensionName: ext.name, pageId: "page-with-params", });

    expect(defaultPageUrl).toBe(`/extension/foo-bar/page-with-params?test1=test1-default`);
  });
});

describe("globalPageRegistry", () => {
  beforeEach(async () => {
    ext = new LensRendererExtension({
      manifest: {
        name: "@acme/foo-bar",
        version: "0.1.1"
      },
      id: "/this/is/fake/package.json",
      absolutePath: "/absolute/fake/",
      manifestPath: "/this/is/fake/package.json",
      isBundled: false,
      isEnabled: true
    });
    (ext.globalPages as PageRegistration[]).push(
      {
        id: "test-page",
        components: {
          Page: () => React.createElement("Text")
        }
      },
      {
        id: "another-page",
        components: {
          Page: () => React.createElement("Text")
        },
      },
      {
        components: {
          Page: () => React.createElement("Default")
        }
      },
    );
  });

  describe("findRegisteredPage", () => {
    it("matching to first registered page without id", () => {
      const page = findRegisteredPage(ext);

      expect(page.id).toEqual(undefined);
      expect(page.extensionName).toEqual(ext.name);
      expect(page.url).toEqual(getExtensionPageUrl({ extensionName: ext.name }));
    });

    it("returns matching page", () => {
      const page = findRegisteredPage(ext, "test-page");

      expect(page.id).toEqual("test-page");
    });

    it("returns null if target not found", () => {
      const page = findRegisteredPage(ext, "wrong-page");

      expect(page).toBeNull();
    });
  });
});
