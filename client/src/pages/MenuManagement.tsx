import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ArrowLeft, Plus, Trash2, Pencil, ChevronDown, ChevronUp,
  UtensilsCrossed, Wine, ChefHat, Package, Save, X
} from "lucide-react";

type PackageType = "food" | "beverages" | "food_and_beverages";

const PACKAGE_TYPE_LABELS: Record<PackageType, string> = {
  food: "Food",
  beverages: "Beverages",
  food_and_beverages: "Food & Beverages",
};

const PACKAGE_TYPE_ICONS: Record<PackageType, React.ReactNode> = {
  food: <UtensilsCrossed className="w-4 h-4" />,
  beverages: <Wine className="w-4 h-4" />,
  food_and_beverages: <ChefHat className="w-4 h-4" />,
};

export default function MenuManagement() {
  const [, setLocation] = useLocation();
  const { user, loading } = useAuth();
  const utils = trpc.useUtils();

  const [expandedPackage, setExpandedPackage] = useState<number | null>(null);
  const [showAddPackage, setShowAddPackage] = useState(false);
  const [editingPackage, setEditingPackage] = useState<any>(null);
  const [showAddItem, setShowAddItem] = useState<number | null>(null);
  const [editingItem, setEditingItem] = useState<any>(null);

  const [pkgForm, setPkgForm] = useState({
    name: "", description: "", type: "food" as PackageType, pricePerHead: ""
  });
  const [itemForm, setItemForm] = useState({
    name: "", description: "", category: "", dietary: "", portionSize: "", sortOrder: ""
  });

  const { data: packages, isLoading } = trpc.menu.listPackages.useQuery(
    undefined, { enabled: !!user?.id }
  );

  const createPackage = trpc.menu.createPackage.useMutation({
    onSuccess: () => {
      utils.menu.listPackages.invalidate();
      setShowAddPackage(false);
      setPkgForm({ name: "", description: "", type: "food", pricePerHead: "" });
      toast.success("Package created");
    },
    onError: () => toast.error("Failed to create package"),
  });

  const updatePackage = trpc.menu.updatePackage.useMutation({
    onSuccess: () => {
      utils.menu.listPackages.invalidate();
      setEditingPackage(null);
      toast.success("Package updated");
    },
    onError: () => toast.error("Failed to update package"),
  });

  const deletePackage = trpc.menu.deletePackage.useMutation({
    onSuccess: () => {
      utils.menu.listPackages.invalidate();
      toast.success("Package deleted");
    },
    onError: () => toast.error("Failed to delete package"),
  });

  const [addItemPackageId, setAddItemPackageId] = useState<number | null>(null);

  const addItem = trpc.menu.addItem.useMutation({
    onSuccess: () => {
      if (addItemPackageId) utils.menu.listItems.invalidate({ packageId: addItemPackageId });
      setShowAddItem(null);
      setAddItemPackageId(null);
      setItemForm({ name: "", description: "", category: "", dietary: "", portionSize: "", sortOrder: "" });
      toast.success("Item added");
    },
    onError: () => toast.error("Failed to add item"),
  });

  const updateItem = trpc.menu.updateItem.useMutation({
    onSuccess: () => {
      if (editingItem?.packageId) utils.menu.listItems.invalidate({ packageId: editingItem.packageId });
      setEditingItem(null);
      toast.success("Item updated");
    },
    onError: () => toast.error("Failed to update item"),
  });

  const deleteItem = trpc.menu.deleteItem.useMutation({
    onSuccess: () => {
      // invalidate all item queries
      utils.menu.listItems.invalidate();
      toast.success("Item deleted");
    },
    onError: () => toast.error("Failed to delete item"),
  });

  if (loading) return (
    <div className="min-h-screen bg-cream flex items-center justify-center">
      <div className="font-bebas tracking-widest text-ink/40 text-sm">LOADING...</div>
    </div>
  );

  const grouped = {
    food: (packages ?? []).filter((p: any) => p.type === "food"),
    beverages: (packages ?? []).filter((p: any) => p.type === "beverages"),
    food_and_beverages: (packages ?? []).filter((p: any) => p.type === "food_and_beverages"),
  };

  return (
    <div className="min-h-screen bg-cream">
      {/* Header */}
      <nav className="bg-forest-dark sticky top-0 z-40 border-b border-gold/20 h-14 flex items-center px-4 gap-4">
        <button onClick={() => setLocation('/dashboard')} className="text-cream/70 hover:text-cream flex items-center gap-1.5 font-bebas tracking-widest text-xs">
          <ArrowLeft className="w-4 h-4" /> DASHBOARD
        </button>
        <div className="h-4 w-px bg-gold/20" />
        <span className="font-cormorant text-cream font-semibold text-base">F&B Menu Management</span>
        <button
          onClick={() => { setShowAddPackage(true); setEditingPackage(null); }}
          className="ml-auto btn-gold font-bebas tracking-widest text-xs px-4 py-1.5 flex items-center gap-1">
          <Plus className="w-3 h-3" /> NEW PACKAGE
        </button>
      </nav>

      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="gold-rule max-w-xs mb-2"><span>MENU MANAGEMENT</span></div>
        <h1 className="font-cormorant text-ink font-semibold mb-2" style={{ fontSize: '2rem' }}>Food & Beverage Packages</h1>
        <p className="font-dm text-sm text-ink/60 mb-8">Create and manage your food and beverage packages, items, and pricing. These packages will appear in your proposals and runsheets.</p>

        {/* Add/Edit Package Form */}
        {(showAddPackage || editingPackage) && (
          <div className="dante-card p-6 mb-6 border-l-4 border-gold">
            <div className="flex items-center justify-between mb-4">
              <div className="font-bebas tracking-widest text-sm text-ink">{editingPackage ? "EDIT PACKAGE" : "NEW PACKAGE"}</div>
              <button onClick={() => { setShowAddPackage(false); setEditingPackage(null); }} className="text-ink/40 hover:text-ink">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="font-bebas text-xs tracking-widest text-ink/50 block mb-1">PACKAGE NAME *</label>
                <Input
                  value={editingPackage ? editingPackage.name : pkgForm.name}
                  onChange={e => editingPackage ? setEditingPackage((p: any) => ({ ...p, name: e.target.value })) : setPkgForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="e.g. Set Menu — 3 Course"
                  className="font-dm text-sm"
                />
              </div>
              <div>
                <label className="font-bebas text-xs tracking-widest text-ink/50 block mb-1">TYPE *</label>
                <Select
                  value={editingPackage ? editingPackage.type : pkgForm.type}
                  onValueChange={v => editingPackage ? setEditingPackage((p: any) => ({ ...p, type: v })) : setPkgForm(p => ({ ...p, type: v as PackageType }))}>
                  <SelectTrigger className="font-dm text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="food">Food</SelectItem>
                    <SelectItem value="beverages">Beverages</SelectItem>
                    <SelectItem value="food_and_beverages">Food & Beverages</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="font-bebas text-xs tracking-widest text-ink/50 block mb-1">PRICE PER HEAD (NZD)</label>
                <Input
                  type="number"
                  value={editingPackage ? editingPackage.pricePerHead ?? "" : pkgForm.pricePerHead}
                  onChange={e => editingPackage ? setEditingPackage((p: any) => ({ ...p, pricePerHead: e.target.value })) : setPkgForm(p => ({ ...p, pricePerHead: e.target.value }))}
                  placeholder="0.00"
                  className="font-dm text-sm"
                />
              </div>
              <div>
                <label className="font-bebas text-xs tracking-widest text-ink/50 block mb-1">DESCRIPTION</label>
                <Textarea
                  value={editingPackage ? editingPackage.description ?? "" : pkgForm.description}
                  onChange={e => editingPackage ? setEditingPackage((p: any) => ({ ...p, description: e.target.value })) : setPkgForm(p => ({ ...p, description: e.target.value }))}
                  rows={2}
                  placeholder="Brief description for proposals..."
                  className="font-dm text-sm"
                />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              {editingPackage ? (
                <button
                  onClick={() => updatePackage.mutate({
                    id: editingPackage.id,
                    name: editingPackage.name,
                    description: editingPackage.description || undefined,
                    type: editingPackage.type,
                    pricePerHead: editingPackage.pricePerHead ? parseFloat(editingPackage.pricePerHead) : null,
                  })}
                  disabled={updatePackage.isPending}
                  className="btn-forest font-bebas tracking-widest text-xs px-4 py-2 flex items-center gap-1">
                  <Save className="w-3 h-3" /> {updatePackage.isPending ? "SAVING..." : "SAVE CHANGES"}
                </button>
              ) : (
                <button
                  onClick={() => createPackage.mutate({
                    name: pkgForm.name,
                    description: pkgForm.description || undefined,
                    type: pkgForm.type,
                    pricePerHead: pkgForm.pricePerHead ? parseFloat(pkgForm.pricePerHead) : undefined,
                  })}
                  disabled={!pkgForm.name || createPackage.isPending}
                  className="btn-forest font-bebas tracking-widest text-xs px-4 py-2 flex items-center gap-1">
                  <Plus className="w-3 h-3" /> {createPackage.isPending ? "CREATING..." : "CREATE PACKAGE"}
                </button>
              )}
              <button onClick={() => { setShowAddPackage(false); setEditingPackage(null); }}
                className="font-bebas tracking-widest text-xs border border-ink/20 text-ink/60 px-4 py-2 hover:bg-ink/5 transition-colors">
                CANCEL
              </button>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="text-center py-12 font-bebas tracking-widest text-ink/30 text-sm">LOADING PACKAGES...</div>
        ) : (packages ?? []).length === 0 ? (
          <div className="border border-dashed border-gold/30 p-16 text-center">
            <Package className="w-12 h-12 text-gold/30 mx-auto mb-4" />
            <div className="font-cormorant text-2xl text-ink/40 mb-2">No packages yet</div>
            <p className="font-dm text-sm text-ink/50 mb-4">Create your first food or beverage package to use in proposals and runsheets.</p>
            <button onClick={() => setShowAddPackage(true)} className="btn-forest font-bebas tracking-widest text-xs px-5 py-2 flex items-center gap-1 mx-auto">
              <Plus className="w-3 h-3" /> CREATE FIRST PACKAGE
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {(["food", "beverages", "food_and_beverages"] as PackageType[]).map(type => {
              const pkgs = grouped[type];
              if (pkgs.length === 0) return null;
              return (
                <div key={type}>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-gold">{PACKAGE_TYPE_ICONS[type]}</span>
                    <span className="font-bebas tracking-widest text-sm text-ink/60">{PACKAGE_TYPE_LABELS[type].toUpperCase()}</span>
                    <div className="flex-1 h-px bg-gold/20" />
                  </div>
                  <div className="space-y-2">
                    {pkgs.map((pkg: any) => (
                      <PackageCard
                        key={pkg.id}
                        pkg={pkg}
                        expanded={expandedPackage === pkg.id}
                        onToggle={() => setExpandedPackage(expandedPackage === pkg.id ? null : pkg.id)}
                        onEdit={() => { setEditingPackage({ ...pkg }); setShowAddPackage(false); }}
                        onDelete={() => {
                          if (confirm(`Delete "${pkg.name}"? This will also delete all items.`)) {
                            deletePackage.mutate({ id: pkg.id });
                          }
                        }}
                        showAddItem={showAddItem === pkg.id}
                        onShowAddItem={() => setShowAddItem(showAddItem === pkg.id ? null : pkg.id)}
                        itemForm={itemForm}
                        setItemForm={setItemForm}
                        onCreateItem={() => {
                          setAddItemPackageId(pkg.id);
                          addItem.mutate({
                            packageId: pkg.id,
                            name: itemForm.name,
                            description: itemForm.description || undefined,
                            category: itemForm.category || undefined,
                            dietaryNotes: itemForm.dietary || undefined,
                            portionSize: itemForm.portionSize || undefined,
                            sortOrder: itemForm.sortOrder ? parseInt(itemForm.sortOrder) : undefined,
                          });
                        }}
                        createItemPending={addItem.isPending}
                        editingItem={editingItem}
                        setEditingItem={setEditingItem}
                        onUpdateItem={(item: any) => updateItem.mutate({
                          id: item.id,
                          name: item.name,
                          description: item.description || undefined,
                          category: item.category || undefined,
                          dietaryNotes: item.dietaryNotes || undefined,
                          portionSize: item.portionSize || undefined,
                        })}
                        updateItemPending={updateItem.isPending}
                        onDeleteItem={(itemId: number) => {
                          if (confirm("Delete this item?")) deleteItem.mutate({ id: itemId });
                        }}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function PackageCard({
  pkg, expanded, onToggle, onEdit, onDelete,
  showAddItem, onShowAddItem, itemForm, setItemForm, onCreateItem, createItemPending,
  editingItem, setEditingItem, onUpdateItem, updateItemPending, onDeleteItem
}: any) {
  const { user } = useAuth();
  const { data: items } = trpc.menu.listItems.useQuery(
    { packageId: pkg.id },
    { enabled: !!user?.id && expanded }
  );

  return (
    <div className="dante-card">
      {/* Package Header */}
      <div className="p-4 flex items-center justify-between cursor-pointer hover:bg-gold/5 transition-colors" onClick={onToggle}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-forest-dark/10 flex items-center justify-center text-forest">
            {pkg.type === 'food' ? <UtensilsCrossed className="w-4 h-4" /> : pkg.type === 'beverages' ? <Wine className="w-4 h-4" /> : <ChefHat className="w-4 h-4" />}
          </div>
          <div>
            <div className="font-cormorant font-semibold text-base text-ink">{pkg.name}</div>
            <div className="flex items-center gap-2">
              {pkg.pricePerHead && (
                <span className="font-dm text-xs text-forest font-semibold">${Number(pkg.pricePerHead).toFixed(2)} pp</span>
              )}
              {pkg.description && <span className="font-dm text-xs text-ink/50">{pkg.description}</span>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={e => { e.stopPropagation(); onEdit(); }}
            className="p-1.5 text-ink/40 hover:text-forest transition-colors">
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button onClick={e => { e.stopPropagation(); onDelete(); }}
            className="p-1.5 text-ink/40 hover:text-red-500 transition-colors">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          {expanded ? <ChevronUp className="w-4 h-4 text-ink/40" /> : <ChevronDown className="w-4 h-4 text-ink/40" />}
        </div>
      </div>

      {/* Items */}
      {expanded && (
        <div className="border-t border-gold/10 p-4">
          {(items ?? []).length === 0 && !showAddItem ? (
            <div className="text-center py-4">
              <div className="font-dm text-sm text-ink/40 mb-2">No items yet</div>
            </div>
          ) : (
            <div className="space-y-1 mb-3">
              {(items ?? []).map((item: any) => (
                <div key={item.id}>
                  {editingItem?.id === item.id ? (
                    <div className="bg-cream border border-gold/20 p-3 space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="font-bebas text-xs tracking-widest text-ink/40 block mb-0.5">NAME</label>
                          <Input value={editingItem.name} onChange={e => setEditingItem((p: any) => ({ ...p, name: e.target.value }))} className="font-dm text-xs h-8" />
                        </div>
                        <div>
                          <label className="font-bebas text-xs tracking-widest text-ink/40 block mb-0.5">CATEGORY</label>
                          <Input value={editingItem.category ?? ""} onChange={e => setEditingItem((p: any) => ({ ...p, category: e.target.value }))} className="font-dm text-xs h-8" placeholder="e.g. Entrée, Main, Dessert" />
                        </div>
                        <div>
                          <label className="font-bebas text-xs tracking-widest text-ink/40 block mb-0.5">DIETARY</label>
                          <Input value={editingItem.dietary ?? ""} onChange={e => setEditingItem((p: any) => ({ ...p, dietary: e.target.value }))} className="font-dm text-xs h-8" placeholder="GF, V, VG, DF..." />
                        </div>
                        <div>
                          <label className="font-bebas text-xs tracking-widest text-ink/40 block mb-0.5">PORTION SIZE</label>
                          <Input value={editingItem.portionSize ?? ""} onChange={e => setEditingItem((p: any) => ({ ...p, portionSize: e.target.value }))} className="font-dm text-xs h-8" placeholder="e.g. 200g" />
                        </div>
                        <div className="col-span-2">
                          <label className="font-bebas text-xs tracking-widest text-ink/40 block mb-0.5">DESCRIPTION</label>
                          <Input value={editingItem.description ?? ""} onChange={e => setEditingItem((p: any) => ({ ...p, description: e.target.value }))} className="font-dm text-xs h-8" />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => onUpdateItem(editingItem)} disabled={updateItemPending}
                          className="btn-forest font-bebas tracking-widest text-xs px-3 py-1 flex items-center gap-1">
                          <Save className="w-3 h-3" /> {updateItemPending ? "SAVING..." : "SAVE"}
                        </button>
                        <button onClick={() => setEditingItem(null)} className="font-bebas tracking-widest text-xs border border-ink/20 text-ink/60 px-3 py-1">CANCEL</button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between py-2 px-3 hover:bg-gold/5 group">
                      <div className="flex items-center gap-3">
                        <div>
                          <span className="font-dm text-sm text-ink">{item.name}</span>
                          {item.category && <span className="font-dm text-xs text-ink/40 ml-2">{item.category}</span>}
                          {item.dietary && <span className="font-bebas text-xs tracking-widest text-forest ml-2 bg-forest/10 px-1">{item.dietary}</span>}
                          {item.portionSize && <span className="font-dm text-xs text-ink/40 ml-2">{item.portionSize}</span>}
                        </div>
                      </div>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => setEditingItem({ ...item })} className="p-1 text-ink/40 hover:text-forest">
                          <Pencil className="w-3 h-3" />
                        </button>
                        <button onClick={() => onDeleteItem(item.id)} className="p-1 text-ink/40 hover:text-red-500">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Add Item Form */}
          {showAddItem ? (
            <div className="bg-cream border border-gold/20 p-3 space-y-2">
              <div className="font-bebas text-xs tracking-widest text-ink/40 mb-2">ADD ITEM</div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bebas text-xs tracking-widest text-ink/40 block mb-0.5">NAME *</label>
                  <Input value={itemForm.name} onChange={e => setItemForm((p: any) => ({ ...p, name: e.target.value }))} className="font-dm text-xs h-8" placeholder="e.g. Pici al Ragù" />
                </div>
                <div>
                  <label className="font-bebas text-xs tracking-widest text-ink/40 block mb-0.5">CATEGORY</label>
                  <Input value={itemForm.category} onChange={e => setItemForm((p: any) => ({ ...p, category: e.target.value }))} className="font-dm text-xs h-8" placeholder="Entrée, Main, Dessert..." />
                </div>
                <div>
                  <label className="font-bebas text-xs tracking-widest text-ink/40 block mb-0.5">DIETARY</label>
                  <Input value={itemForm.dietary} onChange={e => setItemForm((p: any) => ({ ...p, dietary: e.target.value }))} className="font-dm text-xs h-8" placeholder="GF, V, VG, DF..." />
                </div>
                <div>
                  <label className="font-bebas text-xs tracking-widest text-ink/40 block mb-0.5">PORTION SIZE</label>
                  <Input value={itemForm.portionSize} onChange={e => setItemForm((p: any) => ({ ...p, portionSize: e.target.value }))} className="font-dm text-xs h-8" placeholder="e.g. 200g" />
                </div>
                <div className="col-span-2">
                  <label className="font-bebas text-xs tracking-widest text-ink/40 block mb-0.5">DESCRIPTION</label>
                  <Input value={itemForm.description} onChange={e => setItemForm((p: any) => ({ ...p, description: e.target.value }))} className="font-dm text-xs h-8" placeholder="Optional description..." />
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={onCreateItem} disabled={!itemForm.name || createItemPending}
                  className="btn-forest font-bebas tracking-widest text-xs px-3 py-1 flex items-center gap-1">
                  <Plus className="w-3 h-3" /> {createItemPending ? "ADDING..." : "ADD ITEM"}
                </button>
                <button onClick={onShowAddItem} className="font-bebas tracking-widest text-xs border border-ink/20 text-ink/60 px-3 py-1">CANCEL</button>
              </div>
            </div>
          ) : (
            <button onClick={onShowAddItem}
              className="w-full flex items-center justify-center gap-1 py-2 border border-dashed border-gold/30 text-ink/40 hover:text-forest hover:border-forest/40 transition-colors font-bebas tracking-widest text-xs">
              <Plus className="w-3 h-3" /> ADD ITEM
            </button>
          )}
        </div>
      )}
    </div>
  );
}
