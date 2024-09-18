import { useState } from "react";
import { Grid } from "./examples/Simple";

const examplesMap = {
  simple: Grid,
};

type Example = keyof typeof examplesMap;

export const App = () => {
  const [example, setExample] = useState<Example>("simple");
  const Component = examplesMap[example];
  return (
    <div>
      <div>
        {Object.keys(examplesMap).map((exampleKey) => (
          <button
            key={exampleKey}
            onClick={() => setExample(exampleKey as Example)}
          >
            {exampleKey}
          </button>
        ))}
      </div>
      {<Component />}
    </div>
  );
};
