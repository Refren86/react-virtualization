import { faker } from "@faker-js/faker";
import {
  useCallback,
  useEffect,
  useInsertionEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type Key = string | number;

interface UseDynamicSizeGridProps {
  rowsCount: number;
  rowHeight?: (index: number) => number;
  estimateRowHeight?: (index: number) => number;
  getRowKey: (index: number) => Key;
  columnsCount: number;
  columnWidth: (index: number) => number;
  getColumnKey: (index: number) => Key;
  overscanY?: number;
  overscanX?: number;
  scrollingDelay?: number;
  getScrollElement: () => HTMLElement | null;
}

interface DynamicSizeGridRow {
  key: Key;
  index: number;
  offsetTop: number;
  height: number;
}

interface DynamicSizeGridColumn {
  key: Key;
  index: number;
  offsetLeft: number;
  width: number;
}

const DEFAULT_OVERSCAN_Y = 3;
const DEFAULT_OVERSCAN_X = 3;
const DEFAULT_SCROLLING_DELAY = 150;

function validateProps(props: UseDynamicSizeGridProps) {
  const { rowHeight, estimateRowHeight } = props;

  if (!rowHeight && !estimateRowHeight) {
    throw new Error(
      `you must pass either "rowHeight" or "estimateRowHeight" prop`
    );
  }
}

function useLatest<T>(value: T) {
  const valueRef = useRef(value);
  useInsertionEffect(() => {
    valueRef.current = value;
  });
  return valueRef;
}

function useDynamicSizeGrid(props: UseDynamicSizeGridProps) {
  validateProps(props);

  const {
    rowHeight,
    estimateRowHeight,
    getRowKey,
    rowsCount,
    columnsCount,
    columnWidth,
    getColumnKey,
    overscanX = DEFAULT_OVERSCAN_X,
    scrollingDelay = DEFAULT_SCROLLING_DELAY,
    overscanY = DEFAULT_OVERSCAN_Y,
    getScrollElement,
  } = props;

  const [measurementCache, setRowSizeCache] = useState<Record<Key, number>>({});
  const [gridHeight, setGridHeight] = useState(0);
  const [gridWidth, setGridWidth] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [isScrolling, setIsScrolling] = useState(false);

  // observe the scroll container size and update the grid height
  useLayoutEffect(() => {
    const scrollElement = getScrollElement();

    if (!scrollElement) {
      return;
    }

    const resizeObserver = new ResizeObserver(([entry]) => {
      if (!entry) {
        return;
      }
      const size = entry.borderBoxSize[0]
        ? {
            height: entry.borderBoxSize[0].blockSize,
            width: entry.borderBoxSize[0].inlineSize,
          }
        : entry.target.getBoundingClientRect();

      setGridHeight(size.height);
      setGridWidth(size.width);
    });

    resizeObserver.observe(scrollElement);

    return () => {
      resizeObserver.disconnect();
    };
  }, [getScrollElement]);

  // track scroll position (TODO: add debounce)
  useLayoutEffect(() => {
    const scrollElement = getScrollElement();

    if (!scrollElement) {
      return;
    }

    const handleScroll = () => {
      const { scrollTop, scrollLeft } = scrollElement;

      setScrollTop(scrollTop);
      setScrollLeft(scrollLeft);
    };

    handleScroll();

    scrollElement.addEventListener("scroll", handleScroll);

    return () => scrollElement.removeEventListener("scroll", handleScroll);
  }, [getScrollElement]);

  // detects when scrolling has stopped (after a delay)
  useEffect(() => {
    const scrollElement = getScrollElement();

    if (!scrollElement) {
      return;
    }

    let timeoutId: number | null = null;

    const handleScroll = () => {
      setIsScrolling(true);

      if (typeof timeoutId === "number") {
        clearTimeout(timeoutId);
      }

      timeoutId = setTimeout(() => {
        setIsScrolling(false);
      }, scrollingDelay);
    };

    scrollElement.addEventListener("scroll", handleScroll);

    return () => {
      if (typeof timeoutId === "number") {
        clearTimeout(timeoutId);
      }
      scrollElement.removeEventListener("scroll", handleScroll);
    };
  }, [getScrollElement]);

  // calculate the rows that should be rendered based on scroll position
  const { virtualRows, rowStartIndex, rowEndIndex, totalHeight, allRows } =
    useMemo(() => {
      const getRowHeight = (index: number) => {
        if (rowHeight) {
          return rowHeight(index);
        }

        const key = getRowKey(index);
        if (typeof measurementCache[key] === "number") {
          return measurementCache[key]!;
        }

        return estimateRowHeight!(index);
      };

      const rangeStart = scrollTop;
      const rangeEnd = scrollTop + gridHeight;

      let totalHeight = 0;
      let rowStartIndex = -1;
      let rowEndIndex = -1;
      const allRows: DynamicSizeGridRow[] = Array(rowsCount);

      for (let index = 0; index < rowsCount; index++) {
        const key = getRowKey(index);
        const row = {
          key,
          index,
          height: getRowHeight(index),
          offsetTop: totalHeight,
        };

        totalHeight += row.height;
        allRows[index] = row;

        if (rowStartIndex === -1 && row.offsetTop + row.height > rangeStart) {
          rowStartIndex = Math.max(0, index - overscanY);
        }

        if (rowEndIndex === -1 && row.offsetTop + row.height >= rangeEnd) {
          rowEndIndex = Math.min(rowsCount - 1, index + overscanY);
        }
      }

      const virtualRows = allRows.slice(rowStartIndex, rowEndIndex + 1);

      return {
        virtualRows: virtualRows,
        rowStartIndex,
        rowEndIndex,
        allRows: allRows,
        totalHeight,
      };
    }, [
      scrollTop,
      overscanY,
      gridHeight,
      rowHeight,
      getRowKey,
      estimateRowHeight,
      measurementCache,
      rowsCount,
    ]);

  // keep track of the latest values in a ref to avoid stale closures
  const latestData = useLatest({
    measurementCache,
    getRowKey,
    allRows,
    getScrollElement,
    scrollTop,
  });

  const {
    virtualColumns,
    columnStartIndex,
    columnEndIndex,
    allColumns,
    totalWidth,
  } = useMemo(() => {
    const rangeStart = scrollLeft;
    const rangeEnd = scrollLeft + gridWidth;

    let totalWidth = 0;
    let columnStartIndex = -1;
    let columnEndIndex = -1;
    const allColumns: DynamicSizeGridColumn[] = Array(columnsCount);

    for (let index = 0; index < columnsCount; index++) {
      const key = getColumnKey(index);
      const column: DynamicSizeGridColumn = {
        key,
        index,
        width: columnWidth(index),
        offsetLeft: totalWidth,
      };

      totalWidth += column.width;
      allColumns[index] = column;

      if (
        columnStartIndex === -1 &&
        column.offsetLeft + column.width > rangeStart
      ) {
        columnStartIndex = Math.max(0, index - overscanX);
      }

      if (
        columnEndIndex === -1 &&
        column.offsetLeft + column.width >= rangeEnd
      ) {
        columnEndIndex = Math.min(rowsCount - 1, index + overscanX);
      }
    }

    const virtualColumns = allColumns.slice(
      columnStartIndex,
      columnEndIndex + 1
    );

    return {
      virtualColumns,
      columnStartIndex,
      columnEndIndex,
      allColumns,
      totalWidth,
    };
  }, [
    scrollLeft,
    overscanX,
    gridWidth,
    columnWidth,
    getColumnKey,
    columnsCount,
  ]);

  // measure the height of individual grid rows
  const measureRowInner = useCallback(
    (
      element: Element | null,
      resizeObserver: ResizeObserver,
      entry?: ResizeObserverEntry
    ) => {
      if (!element) {
        return;
      }

      if (!element.isConnected) {
        // stop observing if element is no longer in the DOM
        resizeObserver.unobserve(element);
        return;
      }

      const rowIndexAttribute = element.getAttribute("data-row-index") || "";
      const rowIndex = parseInt(rowIndexAttribute, 10);

      if (Number.isNaN(rowIndex)) {
        console.error(
          "dynamic elements must have a valid `data-row-index` attribute"
        );
        return;
      }
      const { measurementCache, getRowKey, allRows, scrollTop } =
        latestData.current;

      const key = getRowKey(rowIndex);
      const isResize = Boolean(entry);

      resizeObserver.observe(element);

      if (!isResize && typeof measurementCache[key] === "number") {
        return;
      }

      const height =
        entry?.borderBoxSize[0]?.blockSize ??
        element.getBoundingClientRect().height;

      if (measurementCache[key] === height) {
        return;
      }

      const row = allRows[rowIndex]!;
      const delta = height - row.height;

      if (delta !== 0 && scrollTop > row.offsetTop) {
        const element = getScrollElement();
        if (element) {
          element.scrollBy(0, delta);
        }
      }

      setRowSizeCache((cache) => ({ ...cache, [key]: height }));
    },
    []
  );

  // creates a single ResizeObserver instance that can be reused for all grid rows
  const rowsResizeObserver = useMemo(() => {
    const ro = new ResizeObserver((entries) => {
      entries.forEach((entry) => {
        measureRowInner(entry.target, ro, entry);
      });
    });
    return ro;
  }, [latestData]);

  const measureRow = useCallback(
    (element: Element | null) => {
      measureRowInner(element, rowsResizeObserver);
    },
    [rowsResizeObserver]
  );

  return {
    virtualRows,
    totalHeight,
    rowStartIndex,
    rowEndIndex,
    isScrolling,
    allRows,
    measureRow,
    virtualColumns,
    columnStartIndex,
    columnEndIndex,
    allColumns,
    totalWidth,
  };
}

const containerHeight = 600;
const gridSize = 100;

const createItems = () =>
  Array.from({ length: gridSize }, (_) => ({
    id: Math.random().toString(36).slice(2),
    columns: Array.from({ length: gridSize }, () => ({
      id: Math.random().toString(36).slice(2),
      text: faker.lorem.words({ min: 1, max: 4 }),
    })),
  }));

export function Grid() {
  const [gridItems, setGridItems] = useState(createItems);
  const scrollElementRef = useRef<HTMLDivElement>(null);

  const { virtualRows, totalHeight, measureRow } = useDynamicSizeGrid({
    estimateRowHeight: useCallback(() => 50, []),
    rowsCount: gridSize,
    getScrollElement: useCallback(() => scrollElementRef.current, []),
    getRowKey: useCallback((index) => gridItems[index]!.id, [gridItems]),
  });

  const reverseGrid = () => {
    setGridItems((items) =>
      items
        .map((item) => ({
          ...item,
          columns: item.columns.slice().reverse(),
        }))
        .reverse()
    );
  };

  return (
    <div style={{ padding: "0 12px" }}>
      <h1>Grid</h1>
      <div style={{ marginBottom: 12 }}>
        <button onClick={reverseGrid}>reverse</button>
      </div>
      <div
        ref={scrollElementRef}
        style={{
          height: containerHeight,
          overflow: "auto",
          border: "1px solid lightgrey",
          position: "relative",
        }}
      >
        <div style={{ height: totalHeight }}>
          {virtualRows.map((virtualRow) => {
            const row = gridItems[virtualRow.index]!;

            return (
              <div
                key={row.id}
                data-row-index={virtualRow.index}
                ref={measureRow}
                style={{
                  position: "absolute",
                  top: 0,
                  transform: `translateY(${virtualRow.offsetTop}px)`,
                  padding: "6px 12px",
                  display: "flex",
                }}
              >
                {virtualRow.index}
                {row.columns.map((col) => (
                  <div key={col.id} style={{ width: 200 }}>
                    {col.text}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
