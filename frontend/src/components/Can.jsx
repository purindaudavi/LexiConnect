import useHasPrivilege from "../hooks/useHasPrivilege";

const Can = ({ privilege, children }) => {
  const allowed = useHasPrivilege(privilege);
  if (!allowed) return null;
  return children;
};

export default Can;
